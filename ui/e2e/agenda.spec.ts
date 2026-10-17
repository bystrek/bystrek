import { expect, test } from '@playwright/test';

test('opens the selected occurrence when a series has multiple events', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.addInitScript(() => {
    window.localStorage.setItem('bystrek_token', 'fake-token');
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Test User', role: 'user' } } }),
  );
  await page.route('**/calendar/events/timezone', (route) =>
    route.fulfill({ json: { timezone: 'Europe/Warsaw' } }),
  );

  const first = {
    uid: 'weekly',
    summary: 'Morning sync',
    start: '2026-10-17T10:00:00+00:00',
    end: '2026-10-17T11:00:00+00:00',
    startWeekday: 'Saturday',
    endWeekday: 'Saturday',
    description: null,
    location: null,
    rrule: 'FREQ=WEEKLY',
  };
  const second = {
    ...first,
    summary: 'Evening sync',
    start: '2026-10-17T14:00:00+00:00',
    end: '2026-10-17T15:00:00+00:00',
  };
  await page.route('**/calendar/events?*', (route) =>
    route.fulfill({ json: { events: [first, second] } }),
  );
  await page.route('**/calendar/events/weekly?*', (route) => {
    const occurrence = new URL(route.request().url()).searchParams.get('occurrence');
    route.fulfill({ json: occurrence === second.start ? second : first });
  });

  await page.goto('/agenda');
  await expect(page.locator('.event-card')).toHaveCount(2);
  await page.getByRole('link', { name: /Evening sync/ }).click();
  await expect(page.locator('.detail-title')).toHaveText('Evening sync');
  expect(new URL(page.url()).searchParams.get('occurrence')).toBe(second.start);
});

test('anchors today, navigation, and requested week to the account timezone', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T23:30:00Z'));
  await page.addInitScript(() => {
    window.localStorage.setItem('bystrek_token', 'fake-token');
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Test User', role: 'user' } } }),
  );
  await page.route('**/calendar/events/timezone', (route) =>
    route.fulfill({ json: { timezone: 'Pacific/Kiritimati' } }),
  );
  const requests: URL[] = [];
  await page.route('**/calendar/events?*', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        events: [
          {
            uid: 'midnight',
            summary: 'Just after midnight',
            start: '2026-10-19T00:15:00+14:00',
            end: '2026-10-19T01:00:00+14:00',
            startWeekday: 'Monday',
            endWeekday: 'Monday',
            description: null,
            location: null,
            rrule: null,
          },
        ],
      },
    });
  });

  await page.goto('/agenda');
  await expect(page.locator('.day-title')).toContainText('Mon, Oct 19');
  await expect(page.getByRole('link', { name: /Just after midnight/ })).toBeVisible();
  expect(requests[0].searchParams.get('start')).toBe('2026-10-19T00:00:00');
  expect(requests[0].searchParams.get('end')).toBe('2026-10-25T23:59:59');

  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.locator('.day-title')).toContainText('Sun, Oct 18');
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.day-title')).toContainText('Mon, Oct 19');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.day-col-head.today .day-num')).toHaveText('19');
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('.week-title')).toContainText('Oct 12');
  await expect.poll(() => requests.at(-1)?.searchParams.get('start')).toBe('2026-10-12T00:00:00');

  await page.clock.setFixedTime(new Date('2026-10-19T23:30:00Z'));
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.day-title')).toContainText('Tue, Oct 20');
  await expect(page.locator('.day-sub .today-pill')).toHaveText('Today');
});

test('shows an error rather than requesting a browser-timezone range if timezone lookup fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bystrek_token', 'fake-token');
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Test User', role: 'user' } } }),
  );
  await page.route('**/calendar/events/timezone', (route) =>
    route.fulfill({ status: 500, json: {} }),
  );
  let requested = false;
  await page.route('**/calendar/events?*', (route) => {
    requested = true;
    return route.fulfill({ json: { events: [] } });
  });

  await page.goto('/agenda');
  await expect(page.getByText('Could not load your timezone.')).toBeVisible();
  expect(requested).toBe(false);
});
