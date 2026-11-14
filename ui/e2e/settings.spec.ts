import path from 'node:path';
import { expect, test } from '@playwright/test';
import { mockSession, mockSignIn } from './support/mocks';

const fixtureImage = path.join(__dirname, 'fixtures', 'avatar.png');

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
  await page.route('**/api/auth/api-key/list', (route) => route.fulfill({ json: { apiKeys: [] } }));
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

  await expect(page.locator('.ek-status')).toHaveText('Saved.');
  expect(updateBody?.['firstName']).toBe('Michał');
  expect(updateBody?.['lastName']).toBe('Bobrowicz');
  expect(updateBody?.['name']).toBe('Michał Bobrowicz');
  expect(String(updateBody?.['image'])).toMatch(/^data:image\/jpeg;base64,/);
});

test('creates a personal API token, shows it once, and revokes it', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page);
  await page.route('**/calendar/credentials', (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route('**/calendar/sync', (route) =>
    route.fulfill({ json: { status: 'ready', fetched: 0, total: 0, error: null } }),
  );

  type Listed = { id: string; name: string; start: string; createdAt: string; lastRequest: null };
  let tokens: Listed[] = [];
  await page.route('**/api/auth/api-key/list', (route) =>
    route.fulfill({ json: { apiKeys: tokens } }),
  );
  await page.route('**/api/auth/api-key/create', (route) => {
    const { name } = route.request().postDataJSON();
    tokens = [
      {
        id: 't1',
        name,
        start: 'bystrek_abcd',
        createdAt: new Date().toISOString(),
        lastRequest: null,
      },
    ];
    route.fulfill({ json: { ...tokens[0], key: 'bystrek_abcdSECRET' } });
  });
  let revokedId: string | undefined;
  await page.route('**/api/auth/api-key/delete', (route) => {
    revokedId = route.request().postDataJSON().keyId;
    tokens = [];
    route.fulfill({ json: { success: true } });
  });

  await page.addInitScript(() => sessionStorage.setItem('bystrek_sign_in_state', 'e2e-state'));
  await page.goto('/auth/callback?state=e2e-state&ott=fake-ott');
  await expect(page).toHaveURL('/timeline');
  await page.goto('/settings');

  await page.getByPlaceholder('Token name').fill('Health Auto Export');
  await page.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByLabel('New API token')).toHaveValue('bystrek_abcdSECRET');
  await expect(page.getByText('Health Auto Export', { exact: true })).toBeVisible();
  await expect(page.getByText('bystrek_abcd…')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke Health Auto Export' }).click();

  await expect(page.getByRole('button', { name: 'Revoke Health Auto Export' })).toHaveCount(0);
  expect(revokedId).toBe('t1');
});

test('still shows a new token when reloading the list fails', async ({ page }) => {
  await mockSignIn(page);
  await mockSession(page);
  await page.route('**/calendar/credentials', (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route('**/calendar/sync', (route) =>
    route.fulfill({ json: { status: 'ready', fetched: 0, total: 0, error: null } }),
  );
  let created = false;
  await page.route('**/api/auth/api-key/list', (route) =>
    created
      ? route.fulfill({ status: 500, json: { message: 'List is down.' } })
      : route.fulfill({ json: { apiKeys: [] } }),
  );
  await page.route('**/api/auth/api-key/create', (route) => {
    created = true;
    route.fulfill({ json: { id: 't1', key: 'bystrek_abcdSECRET' } });
  });

  await page.addInitScript(() => sessionStorage.setItem('bystrek_sign_in_state', 'e2e-state'));
  await page.goto('/auth/callback?state=e2e-state&ott=fake-ott');
  await expect(page).toHaveURL('/timeline');
  await page.goto('/settings');

  await page.getByPlaceholder('Token name').fill('Health Auto Export');
  await page.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByLabel('New API token')).toHaveValue('bystrek_abcdSECRET');
  await expect(page.getByText('List is down.')).toBeVisible();
});
