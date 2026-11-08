import { expect, test, type Page } from '@playwright/test';

const camelot = {
  id: 'p1',
  name: 'Café Camelot',
  category: 'cafe',
  address: 'Świętego Tomasza 17, Kraków',
  displayAddress: 'Camelot, 17, Świętego Tomasza, Stare Miasto, Kraków, 31-022, Polska',
  lat: 50.0624,
  lng: 19.9394,
  osmType: 'node',
  osmId: 2412345678,
  notes: 'Great cheesecake',
  url: null,
  createdBy: { id: '1', name: 'Michał B' },
  createdAt: '2026-11-08T12:00:00.000Z',
  updatedAt: '2026-11-08T12:00:00.000Z',
  visitedByMe: false,
};

async function signIn(page: Page) {
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-auth-token': 'fake-token' },
      json: { token: 'fake-token', user: { id: '1' } },
    }),
  );
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Michał B', role: 'user', image: null } } }),
  );
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

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill('me@example.com');
  await page.getByPlaceholder('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/agenda');
}

test('types a place, previews it, saves it and sees it in the list', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/places', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 201, json: camelot }),
  );
  await page.route('**/api/places/draft', (route) =>
    route.fulfill({
      json: {
        kind: 'ready',
        draft: {
          name: camelot.name,
          category: camelot.category,
          address: camelot.address,
          notes: camelot.notes,
          url: null,
        },
        location: {
          osmType: camelot.osmType,
          osmId: camelot.osmId,
          displayAddress: camelot.displayAddress,
          lat: camelot.lat,
          lng: camelot.lng,
        },
      },
    }),
  );

  await page.goto('/places');
  await expect(page.getByText('No places yet.')).toBeVisible();

  const prompt = 'Café Camelot, Świętego Tomasza 17, Kraków — great cheesecake';
  const input = page.getByRole('textbox', { name: 'Add a place' });
  await input.fill(prompt);
  await page.getByRole('button', { name: 'Draft place' }).click();

  await expect(page.getByText(`Found as: ${camelot.displayAddress}`)).toBeVisible();
  await expect(input).toHaveValue(prompt);

  const saved = page.waitForRequest(
    (req) => req.url().endsWith('/api/places') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    name: camelot.name,
    osmType: 'node',
    osmId: camelot.osmId,
  });

  await expect(
    page.locator('app-place-row').getByRole('heading', { name: camelot.name }),
  ).toBeVisible();
  await expect(input).toHaveValue('');
});
