import { Injectable } from '@nestjs/common';
import { createDAVClient } from 'tsdav';
import { assertSafeCaldavUrl } from './caldav-url';
import { CaldavUnavailableError } from './caldav-transport';
import type { CalendarCredentials } from './calendar-credentials.service';
import { CalendarNotConfiguredError, CalendarUrlMismatchError } from './calendar.errors';

export interface CalendarSummary {
  url: string;
  displayName: string | null;
}

// CalDAV discovery (well-known URL → principal → calendar home → calendars) through a tsdav
// client. It costs 6+ requests, so it runs only before anything is cached: when picking a
// calendar, on the first sync, and when the server says the calendar moved.
@Injectable()
export class CalendarDiscovery {
  async listCalendars(
    caldavUrl: string,
    username: string,
    password: string,
  ): Promise<CalendarSummary[]> {
    assertSafeCaldavUrl(caldavUrl);
    const client = await createDAVClient({
      serverUrl: caldavUrl,
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    const calendars = await client.fetchCalendars();
    return calendars.map((c) => ({
      url: c.url,
      displayName: typeof c.displayName === 'string' ? c.displayName : null,
    }));
  }

  // The URL of the user's chosen calendar, or of the first one when none is chosen.
  async resolveCalendarUrl(creds: CalendarCredentials): Promise<string> {
    let calendars: CalendarSummary[];
    try {
      calendars = await this.listCalendars(creds.caldavUrl, creds.username, creds.password);
    } catch (err) {
      throw new CaldavUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (calendars.length === 0) throw new CalendarNotConfiguredError();
    const url = this.chooseCalendar(calendars, creds.calendarUrl);
    // Cached and then requested directly, so it gets the same check as the URL the user typed.
    assertSafeCaldavUrl(url);
    return url;
  }

  private chooseCalendar(calendars: CalendarSummary[], calendarUrl: string | null): string {
    if (!calendarUrl) return calendars[0].url;

    // Matched by the calendar's own (server-assigned, stable) URL, not a human-typed display
    // name (see schema.ts). iCloud moves an account to another partition host and keeps the
    // path, so the path alone matches too.
    const path = new URL(calendarUrl).pathname;
    const calendar =
      calendars.find((c) => c.url === calendarUrl) ??
      calendars.find((c) => new URL(c.url).pathname === path);
    if (!calendar) {
      throw new CalendarUrlMismatchError(
        calendarUrl,
        calendars.map((c) => c.url),
      );
    }
    return calendar.url;
  }
}
