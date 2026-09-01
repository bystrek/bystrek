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

// Signing in now lands straight on /chat (the '' route redirects there), so
// the chat-history route must be mocked *before* signing in — it fires as
// soon as the redirect resolves, not after a later navigation.
async function signIn(
  page: import('@playwright/test').Page,
  history: { role: string; text: string }[] = [],
) {
  await mockSignIn(page);
  await mockSession(page);
  await page.route('**/users', (route) => route.fulfill({ json: [] }));
  await page.route('**/chat/history', (route) => route.fulfill({ json: history }));
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/chat');
}

test('sends a message and renders the streamed reply', async ({ page }) => {
  await signIn(page);

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

  const input = page.getByPlaceholder('Message');
  const button = page.getByRole('button', { name: 'Send message' });

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

test('auto-scrolls to a new reply even when it pushes the message list well past the fold', async ({
  page,
}) => {
  // Regression test: the old auto-scroll check measured "am I near the
  // bottom" from the DOM *after* the new message had already grown the
  // container, so any reply taller than ~80px made it look like the user
  // wasn't near the bottom and skipped scrolling — the new reply landed
  // below the fold, invisible, even though the user was at the bottom
  // right before it arrived.
  // Enough prior history that the message list already overflows its
  // max-height, so there's real scrolling distance to cover.
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `Message number ${i} with a bit of text to take up some space.`,
  }));
  await signIn(page, history);

  const longReply =
    'Line one of a long, multi-part reply.\n\n' +
    'Line two, still going.\n\n' +
    'Line three — this reply is deliberately tall enough to exceed the old 80px threshold on its own.';
  await page.route('**/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: {"delta":${JSON.stringify(longReply)}}\n\n`,
    });
  });

  const input = page.getByPlaceholder('Message');
  await input.fill('one more thing');
  await page.getByRole('button', { name: 'Send message' }).click();

  const newReply = page.locator('.bubble.assistant').last();
  await expect(newReply).toHaveText(longReply);
  await expect(newReply).toBeInViewport();
});

test('opens with history pinned to the bottom, not scrolled to the top', async ({ page }) => {
  // Regression test for #22: with zoneless change detection, the initial
  // scroll to bottom used to hang off ngAfterViewChecked, which only ran
  // during the component-init CD pass — before history arrived. When the
  // history signal later updated the DOM, the lifecycle hook never fired
  // again, so the message list stayed at scrollTop: 0.
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `Seeded message ${i}.`,
  }));
  await signIn(page, history);

  const lastBubble = page.locator('.bubble').last();
  await expect(lastBubble).toHaveText(`Seeded message ${history.length - 1}.`);
  await expect(lastBubble).toBeInViewport();
});
