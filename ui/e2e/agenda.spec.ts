import { expect, test } from '@playwright/test';

test('opens the selected occurrence when a series has multiple events', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.addInitScript(() => {
    window.localStorage.setItem('bystrek_token', 'fake-token');
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Test User', role: 'user' } } }),
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
