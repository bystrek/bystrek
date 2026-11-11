import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixtureImage = path.join(__dirname, 'fixtures', 'avatar.png');

function mockSignIn(page: import('@playwright/test').Page) {
  return page.route('**/api/auth/one-time-token/verify', (route) =>
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
          name: 'Michał B',
          role: 'user',
          firstName: 'Michał',
          lastName: 'B',
          image: null,
        },
      },
    }),
  );
}

test('edits first/last name and avatar, then saves via update-user', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page);

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
  await page.route('**/calendar/sync', (route) =>
    route.fulfill({ json: { status: 'ready', fetched: 0, total: 0, error: null } }),
  );
  let updateBody: Record<string, unknown> | undefined;
  await page.route('**/api/auth/update-user', (route) => {
    updateBody = route.request().postDataJSON();
    route.fulfill({ json: { status: true } });
  });

  // Where Pocket ID sign-in lands, with the one-time token the API hands over
  // and the state this tab stored when it started signing in.
  await page.addInitScript(() => sessionStorage.setItem('bystrek_sign_in_state', 'e2e-state'));
  await page.goto('/auth/callback?state=e2e-state&ott=fake-ott');

  await expect(page).toHaveURL('/timeline');

  // The old route name still lands on the timeline.
  await page.goto('/agenda');
  await expect(page).toHaveURL('/timeline');

  await page.goto('/settings');
  await expect(page).toHaveURL('/settings');

  await expect(page.getByPlaceholder('First name')).toHaveValue('Michał');
  await expect(page.getByPlaceholder('Last name')).toHaveValue('B');

  await page.getByPlaceholder('Last name').fill('Bobrowicz');
  await page.locator('input[type="file"]').setInputFiles(fixtureImage);
  await expect(page.locator('img.avatar')).toBeVisible();

  await page.locator('#profile').getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.status')).toHaveText('Saved.');
  expect(updateBody?.['firstName']).toBe('Michał');
  expect(updateBody?.['lastName']).toBe('Bobrowicz');
  expect(updateBody?.['name']).toBe('Michał Bobrowicz');
  expect(String(updateBody?.['image'])).toMatch(/^data:image\/jpeg;base64,/);
});
