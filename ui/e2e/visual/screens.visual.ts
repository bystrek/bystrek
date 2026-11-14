import { expect, test } from '@playwright/test';
import { mockSession, mockSignIn } from '../support/mocks';

// Key screens, with the API mocked the way the e2e specs do.
test('login', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('button', { name: 'Sign in with Pocket ID' })).toBeVisible();
  await expect(page).toHaveScreenshot('login.png', { animations: 'disabled' });
});

test('settings', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page);
  await page.route('**/calendar/credentials', (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route('**/calendar/sync', (route) =>
    route.fulfill({ json: { status: 'ready', fetched: 0, total: 0, error: null } }),
  );
  await page.route('**/api/auth/api-key/list', (route) => route.fulfill({ json: { apiKeys: [] } }));
  await page.addInitScript(() => sessionStorage.setItem('bystrek_sign_in_state', 'e2e-state'));
  await page.goto('/auth/callback?state=e2e-state&ott=fake-ott');
  await expect(page).toHaveURL('/timeline');
  await page.goto('/settings');
  await expect(page.getByPlaceholder('First name')).toHaveValue('Michał');
  await expect(page).toHaveScreenshot('settings.png', { fullPage: true, animations: 'disabled' });
});

test('not found', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page).toHaveScreenshot('not-found.png', { animations: 'disabled' });
});
