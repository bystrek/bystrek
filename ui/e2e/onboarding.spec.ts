import { expect, test, type Page } from '@playwright/test';

type Progress = { status: string; fetched: number; total: number | null; error: string | null };

async function signIn(page: Page) {
  await page.route('**/api/auth/one-time-token/verify', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-auth-token': 'fake-token' },
      json: { token: 'fake-token', user: { id: '1' } },
    }),
  );
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: '1', name: 'Michał B', role: 'user', firstName: 'Michał', lastName: 'B' },
      },
    }),
  );
  await page.route('**/calendar/events/timezone', (route) =>
    route.fulfill({ json: { timezone: 'Europe/Warsaw' } }),
  );
  await page.route(/\/calendar\/events\?/, (route) => route.fulfill({ json: { events: [] } }));

  // Where Pocket ID sign-in lands, with the one-time token the API hands over
  // and the state this tab stored when it started signing in.
  await page.addInitScript(() => sessionStorage.setItem('bystrek_sign_in_state', 'e2e-state'));
  await page.goto('/auth/callback?state=e2e-state&ott=fake-ott');
}

// Serves GET /calendar/sync from a queue: each poll takes the next answer, the last one repeats.
// Answers 400 (nothing connected) until credentials are saved.
async function mockCalendar(page: Page, answers: Progress[]) {
  let connected = false;
  const saved: Record<string, unknown>[] = [];
  const retries: number[] = [];
  await page.route('**/calendar/credentials', (route) => {
    if (route.request().method() === 'PUT') {
      saved.push(route.request().postDataJSON());
      connected = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        configured: connected,
        caldavUrl: null,
        username: null,
        calendarUrl: null,
        calendarDisplayName: null,
      },
    });
  });
  await page.route('**/calendar/credentials/preview-calendars', (route) =>
    route.fulfill({
      json: {
        calendars: [
          { url: 'https://p1.caldav.icloud.com/1/calendars/home/', displayName: 'Home' },
          { url: 'https://p1.caldav.icloud.com/1/calendars/work/', displayName: 'Work' },
        ],
      },
    }),
  );
  await page.route('**/calendar/sync', (route) => {
    if (route.request().method() === 'POST') {
      retries.push(1);
      return route.fulfill({ json: { status: 'pending', fetched: 0, total: null, error: null } });
    }
    if (!connected) return route.fulfill({ status: 400, json: { message: 'no calendar' } });
    return route.fulfill({ json: answers.length > 1 ? answers.shift() : answers[0] });
  });
  return { saved, retries };
}

test('a new user connects iCloud and sees progress until the timeline unlocks', async ({
  page,
}) => {
  const { saved } = await mockCalendar(page, [
    { status: 'syncing', fetched: 0, total: 105, error: null },
    { status: 'syncing', fetched: 50, total: 105, error: null },
    { status: 'ready', fetched: 105, total: 105, error: null },
  ]);
  await signIn(page);

  // The timeline is locked until a calendar is connected.
  await expect(page).toHaveURL('/connect');
  await page.getByRole('button', { name: 'iCloud' }).click();
  await expect(page.getByText('App-Specific Passwords')).toBeVisible();
  await page.getByPlaceholder('Apple Account email').fill('me@icloud.com');
  await page.getByPlaceholder('App-specific password').fill('abcd-efgh-ijkl-mnop');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Work').check();
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page).toHaveURL('/sync');
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page).toHaveURL('/timeline');
  expect(saved[0]).toMatchObject({
    caldavUrl: 'https://caldav.icloud.com',
    username: 'me@icloud.com',
    calendarUrl: 'https://p1.caldav.icloud.com/1/calendars/work/',
    calendarDisplayName: 'Work',
  });
});

test('a failed sync shows an actionable error and can be retried', async ({ page }) => {
  let progress: Progress = { status: 'error', fetched: 3, total: 105, error: 'HTTP 500' };
  let retries = 0;
  await page.route('**/calendar/sync', (route) => {
    if (route.request().method() === 'POST') {
      retries++;
      progress = { status: 'ready', fetched: 105, total: 105, error: null };
      return route.fulfill({ json: { status: 'pending', fetched: 3, total: 105, error: null } });
    }
    return route.fulfill({ json: progress });
  });
  await signIn(page);

  await expect(page).toHaveURL('/sync');
  await expect(page.getByRole('alert')).toContainText("Your calendar didn't sync");
  await expect(page.getByRole('alert')).toContainText('HTTP 500');
  await expect(page.getByRole('link', { name: 'Update credentials' })).toBeVisible();

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL('/timeline');
  expect(retries).toBe(1);
});
