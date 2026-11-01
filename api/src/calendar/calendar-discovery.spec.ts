import { describe, expect, it } from 'bun:test';
import type { CalendarCredentials } from './calendar-credentials.service';
import { CalendarDiscovery, type CalendarSummary } from './calendar-discovery';

const personal: CalendarSummary = {
  url: 'https://p01-caldav.example.com/123/calendars/personal/',
  displayName: 'Personal',
};
const other: CalendarSummary = {
  url: 'https://p01-caldav.example.com/123/calendars/other/',
  displayName: 'Other',
};

// Stands in for the tsdav client: only the account's calendar list matters here.
class FakeDiscovery extends CalendarDiscovery {
  constructor(private readonly calendars: CalendarSummary[]) {
    super();
  }

  override listCalendars(): Promise<CalendarSummary[]> {
    return Promise.resolve(this.calendars);
  }
}

function creds(calendarUrl: string | null): CalendarCredentials {
  return { caldavUrl: 'https://caldav.example.com', username: 'u', password: 'p', calendarUrl };
}

describe('CalendarDiscovery.resolveCalendarUrl', () => {
  it('selects the calendar matching calendarUrl when one is configured', async () => {
    const discovery = new FakeDiscovery([other, personal]);
    expect(await discovery.resolveCalendarUrl(creds(personal.url))).toBe(personal.url);
  });

  it('uses the first calendar when no calendarUrl is configured', async () => {
    const discovery = new FakeDiscovery([personal, other]);
    expect(await discovery.resolveCalendarUrl(creds(null))).toBe(personal.url);
  });

  it('finds the calendar by path after the account moves to another host', async () => {
    const moved = { ...personal, url: personal.url.replace('p01-', 'p42-') };
    const discovery = new FakeDiscovery([other, moved]);
    expect(await discovery.resolveCalendarUrl(creds(personal.url))).toBe(moved.url);
  });

  // Real bug hit in production: a configured calendar that matched nothing was treated
  // the same as "nothing configured at all". A calendar since deleted still needs a
  // distinct, actionable error.
  it('gives a distinct, actionable error when calendarUrl matches nothing', async () => {
    const discovery = new FakeDiscovery([personal]);
    await expect(
      discovery.resolveCalendarUrl(creds('https://p01-caldav.example.com/123/calendars/gone/')),
    ).rejects.toThrow(/gone.*personal/s);
  });

  it('reports an account without calendars as not configured', async () => {
    await expect(new FakeDiscovery([]).resolveCalendarUrl(creds(null))).rejects.toThrow(
      'no calendar connected',
    );
  });
});

describe('CalendarDiscovery.listCalendars', () => {
  it('rejects a non-https URL before ever connecting', async () => {
    await expect(
      new CalendarDiscovery().listCalendars('http://dav.example.com', 'user', 'pass'),
    ).rejects.toThrow('caldavUrl must use https');
  });
});
