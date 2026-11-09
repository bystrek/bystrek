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
  await page.route('**/api/auth/one-time-token/verify', (route) =>
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

  // Where Pocket ID sign-in lands, with the one-time token the API hands over.
  await page.goto('/auth/callback?ott=fake-ott');
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

test('shows places as pins and marks one visited from its pin', async ({ page }) => {
  await signIn(page);
  const wawel = {
    ...camelot,
    id: 'p2',
    name: 'Wawel',
    lat: 50.0541,
    lng: 19.9354,
    visitedByMe: true,
  };
  await page.route('**/api/places', (route) => route.fulfill({ json: [camelot, wawel] }));
  await page.route('**/api/places/p1/visit', (route) => route.fulfill({ status: 204 }));
  // An empty style with one attributed source keeps the test off the real tile host.
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          base: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'base', type: 'circle', source: 'base' }],
      },
    }),
  );

  await page.goto('/places');
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  const toVisit = page.getByRole('button', { name: 'Café Camelot, to visit' });
  await expect(toVisit).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wawel, visited' })).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
    '© OpenStreetMap contributors',
  );

  await toVisit.click();
  const card = page.locator('app-place-row');
  await expect(card.getByRole('heading', { name: camelot.name })).toBeVisible();
  const visited = page.waitForRequest(
    (req) => req.url().endsWith('/api/places/p1/visit') && req.method() === 'PUT',
  );
  await card.getByRole('button', { name: 'Visited' }).click();
  await visited;
  await expect(page.getByRole('button', { name: 'Café Camelot, visited' })).toBeVisible();
});
