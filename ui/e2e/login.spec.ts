import { expect, test } from '@playwright/test';

test('signs in through the API, which sends the browser on to Pocket ID', async ({ page }) => {
  let signInUrl: URL | undefined;
  await page.route('**/api/auth/sign-in?*', (route) => {
    signInUrl = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<p>Pocket ID</p>' });
  });

  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'Sign in with Pocket ID' }).click();

  await expect(page.getByText('Pocket ID', { exact: true })).toBeVisible();
  expect(signInUrl?.searchParams.get('to')).toBe(new URL('/auth/callback', page.url()).href);
});

test('shows why Pocket ID refused the sign-in', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied');

  await expect(page).toHaveURL('/auth/login?error=access_denied');
  await expect(page.getByText("doesn't have access to bystrek")).toBeVisible();
});

test('shows an expired sign-in when the one-time token is rejected', async ({ page }) => {
  await page.route('**/api/auth/one-time-token/verify', (route) =>
    route.fulfill({ status: 400, json: { message: 'Invalid token' } }),
  );

  await page.goto('/auth/callback?ott=used');

  await expect(page).toHaveURL('/auth/login?error=invalid_token');
  await expect(page.getByText('That sign-in link has expired')).toBeVisible();
});
