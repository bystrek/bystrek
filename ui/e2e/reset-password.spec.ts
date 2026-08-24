import { expect, test } from '@playwright/test';

test('sets a new password and redirects to sign-in', async ({ page }) => {
  let requestBody: unknown;
  await page.route('**/api/auth/reset-password', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: { status: true } });
  });

  await page.goto('/auth/reset-password?token=fake-token');
  await page.getByPlaceholder('New password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Set password' }).click();

  await expect(page.getByText('Password updated.', { exact: false })).toBeVisible();
  expect(requestBody).toEqual({ newPassword: 'correct horse battery staple', token: 'fake-token' });

  // A password reset never establishes a session — landing on / while
  // signed out now correctly guard-redirects to /auth/login, not a bug.
  await expect(page).toHaveURL('/auth/login', { timeout: 3000 });
});

test('shows an error message for an invalid or missing token', async ({ page }) => {
  await page.goto('/auth/reset-password?error=INVALID_TOKEN');

  await expect(page.getByText('invalid or has expired', { exact: false })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
});
