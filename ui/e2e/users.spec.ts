import { expect, test } from '@playwright/test';

function mockSession(page: import('@playwright/test').Page, role: 'user' | 'admin') {
  return page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { session: {}, user: { id: '1', name: 'Michał', role } } }),
  );
}

function mockSignIn(page: import('@playwright/test').Page) {
  // PUBLIC_API_URL (localhost:3000) is a different origin from the app
  // (localhost:4173) even under Playwright's route interception, so the
  // browser still applies CORS header-exposure rules to the mocked
  // response — Access-Control-Expose-Headers is required for
  // res.headers.get('set-auth-token') to see it, same as the real API.
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

test('redirects to the login page when signed out', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/auth/login');
  await expect(page.locator('#login')).toBeVisible();
});

test('signs in and shows users, without admin controls for a regular user', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page, 'user');
  await page.route('**/users', (route) =>
    route.fulfill({
      json: [{ id: '1', name: 'Michał', status: 'active', banned: false }],
    }),
  );
  await page.route('**/chat/history', (route) => route.fulfill({ json: [] }));
  await page.route('**/calendar/credentials', (route) =>
    route.fulfill({
      json: {
        configured: false,
        caldavUrl: null,
        username: null,
        calendarUrl: null,
        calendarDisplayName: null,
      },
    }),
  );

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/chat');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');

  await expect(page.locator('#users h2')).toHaveText('Users');
  await expect(page.locator('#users li')).toContainText('Michał');
  await expect(page.locator('#invite')).toHaveCount(0);
});

test('shows invite form and ban controls for an admin', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page, 'admin');
  await page.route('**/users', (route) =>
    route.fulfill({
      json: [{ id: '1', name: 'Michał', status: 'active', banned: false }],
    }),
  );
  await page.route('**/chat/history', (route) => route.fulfill({ json: [] }));
  await page.route('**/calendar/credentials', (route) =>
    route.fulfill({
      json: {
        configured: false,
        caldavUrl: null,
        username: null,
        calendarUrl: null,
        calendarDisplayName: null,
      },
    }),
  );

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  await page.getByPlaceholder('Email').fill('admin@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/chat');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');

  await expect(page.locator('#invite')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ban' })).toBeVisible();
});
