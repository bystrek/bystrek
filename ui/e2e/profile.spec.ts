import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixtureImage = path.join(__dirname, 'fixtures', 'avatar.png');

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
  await page.route('**/household', (route) =>
    route.fulfill({ json: { name: 'bystrek', members: [] } }),
  );
  let updateBody: Record<string, unknown> | undefined;
  await page.route('**/api/auth/update-user', (route) => {
    updateBody = route.request().postDataJSON();
    route.fulfill({ json: { status: true } });
  });

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Edit profile' }).click();
  await expect(page).toHaveURL('/profile');

  await expect(page.getByPlaceholder('First name')).toHaveValue('Michał');
  await expect(page.getByPlaceholder('Last name')).toHaveValue('B');

  await page.getByPlaceholder('Last name').fill('Bobrowicz');
  await page.locator('input[type="file"]').setInputFiles(fixtureImage);
  await expect(page.locator('img.avatar')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.status')).toHaveText('Saved.');
  expect(updateBody?.['firstName']).toBe('Michał');
  expect(updateBody?.['lastName']).toBe('Bobrowicz');
  expect(updateBody?.['name']).toBe('Michał Bobrowicz');
  expect(String(updateBody?.['image'])).toMatch(/^data:image\/jpeg;base64,/);
});
