import { expect, test } from '@playwright/test';

function mockSignIn(page: import('@playwright/test').Page) {
  return page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-auth-token': 'fake-token' },
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
// the conversation routes must be mocked *before* signing in — they fire as
// soon as the redirect resolves, not after a later navigation.
async function signIn(
  page: import('@playwright/test').Page,
  history: { role: string; text: string }[] = [],
) {
  await mockSignIn(page);
  await mockSession(page);
  await page.route('**/users', (route) => route.fulfill({ json: [] }));
  await page.route('**/chat/conversations', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { id: 'new-id', title: 'New chat', hasTitle: false } })
      : route.fulfill({ json: [{ id: 'first-id', title: 'First chat', hasTitle: true }] }),
  );
  await page.route('**/chat/conversations/*/history', (route) =>
    route.fulfill({ json: route.request().url().includes('first-id') ? history : [] }),
  );
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/chat');
}

test('starts a separate chat and returns to earlier messages', async ({ page }) => {
  await signIn(page, [{ role: 'user', text: 'earlier message' }]);
  await page.route('**/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"delta":"new reply"}\n\n',
    }),
  );
  await expect(page.locator('.bubble.user')).toHaveText('earlier message');

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.locator('.bubble')).toHaveCount(0);
  await expect(page.getByLabel('Conversation')).toHaveValue('new-id');
  await page.getByPlaceholder('Message').fill('new question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.bubble.assistant')).toHaveText('new reply');
  await expect(page.getByLabel('Conversation').locator('option:checked')).toHaveText(
    'new question',
  );

  await page.getByLabel('Conversation').selectOption('first-id');
  await expect(page.locator('.bubble.user')).toHaveText('earlier message');
});

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
  await expect(page.getByRole('status', { name: 'Assistant is thinking' })).toBeVisible();
  releaseChat();

  await expect(page.locator('.bubble.user')).toHaveText('hi there');
  await expect(page.locator('.bubble.assistant')).toHaveText('Hello!');
  await expect(page.getByRole('status', { name: 'Assistant is thinking' })).toHaveCount(0);

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
  await expect(page.getByRole('button', { name: 'New chat' })).toBeInViewport();
});

test('keeps new chat reachable above long history on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `Seeded message ${i}.`,
  }));
  await signIn(page, history);

  await expect(page.locator('.bubble').last()).toBeInViewport();
  await expect(page.getByRole('button', { name: 'New chat' })).toBeInViewport();
});
