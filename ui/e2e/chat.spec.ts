import { expect, test } from '@playwright/test';

function mockSignIn(page: import('@playwright/test').Page) {
  return page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'set-auth-token': 'fake-token',
        'Access-Control-Expose-Headers': 'set-auth-token',
      },
      json: { token: 'fake-token', user: { id: '1' } },
    }),
  );
}

function mockSession(page: import('@playwright/test').Page) {
  return page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: '1',
          name: 'Michał',
          role: 'user',
          firstName: null,
          lastName: null,
          image: null,
        },
      },
    }),
  );
}

async function signIn(page: import('@playwright/test').Page) {
  await mockSignIn(page);
  await mockSession(page);
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('sends a message and renders the streamed reply', async ({ page }) => {
  await signIn(page);
  await page.route('**/household', (route) =>
    route.fulfill({ json: { name: 'bystrek', members: [] } }),
  );
  await page.route('**/chat/history', (route) => route.fulfill({ json: [] }));

  let releaseChat!: () => void;
  const chatRequested = new Promise<void>((resolve) => (releaseChat = resolve));
  await page.route('**/chat', async (route) => {
    await chatRequested;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"delta":"Hel"}\n\ndata: {"delta":"lo!"}\n\n',
    });
  });

  await page.getByRole('link', { name: 'Chat' }).click();
  await expect(page).toHaveURL('/chat');

  const input = page.getByPlaceholder('Message');
  const button = page.getByRole('button', { name: 'Send' });

  await input.fill('hi there');
  await button.click();

  await expect(input).toBeDisabled();
  await expect(button).toBeDisabled();
  releaseChat();

  await expect(page.locator('.bubble.user')).toHaveText('hi there');
  await expect(page.locator('.bubble.assistant')).toHaveText('Hello!');

  await expect(input).toBeEnabled();
  await expect(button).toBeEnabled();
});
