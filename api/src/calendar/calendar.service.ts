import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createDAVClient, type DAVCalendar } from 'tsdav';

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;
import { assertSafeCaldavUrl } from './caldav-url';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { buildEventIcs, parseEventIcs, updateEventIcs, type EventInput } from './ical-event';
import { assertValidTimeZone } from './zoned-time';

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('no calendar connected — set it up on the profile page first');
  }
}

export class CalendarUrlMismatchError extends Error {
  constructor(configuredUrl: string, availableUrls: string[]) {
    super(
      `configured calendar (${configuredUrl}) no longer exists on this account ` +
        `(available: ${availableUrls.length ? availableUrls.join(', ') : 'none'}) — ` +
        `pick a calendar again on the profile page, or clear it to use the first calendar`,
    );
  }
}

export class CalendarEventNotFoundError extends Error {
  constructor(uid: string) {
    super(`no event found with uid "${uid}"`);
  }
}

export interface CalendarSummary {
  url: string;
  displayName: string | null;
}

// Thin per-request wrapper: builds a tsdav DAVClient from the requesting
// user's stored CalDAV credentials and resolves their target calendar. No
// caching — chat's tool-call volume doesn't warrant it, and it keeps every
// call self-contained (no stale client across a long-lived credentials
// change).
@Injectable()
export class CalendarService {
  constructor(private readonly credentials: CalendarCredentialsService) {}

  // Connects with raw, not-yet-saved credentials — backs the profile
  // page's "load calendars" step, so a user can pick a calendar before
  // anything is persisted. Never touches the database.
  async previewCalendars(
    caldavUrl: string,
    username: string,
    password: string,
  ): Promise<CalendarSummary[]> {
    const client = await this.buildClient(caldavUrl, username, password);
    const calendars = await client.fetchCalendars();
    return calendars.map((c) => ({
      url: c.url,
      displayName: typeof c.displayName === 'string' ? c.displayName : null,
    }));
  }

  private async buildClient(
    caldavUrl: string,
    username: string,
    password: string,
  ): Promise<DAVClient> {
    assertSafeCaldavUrl(caldavUrl);
    return createDAVClient({
      serverUrl: caldavUrl,
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  }

  private async connect(userId: string): Promise<{ client: DAVClient; calendar: DAVCalendar }> {
    const creds = await this.credentials.getInternal(userId);
    if (!creds) throw new CalendarNotConfiguredError();

    const client = await this.buildClient(creds.caldavUrl, creds.username, creds.password);

    const calendars = await client.fetchCalendars();
    if (calendars.length === 0) {
      throw new CalendarNotConfiguredError();
    }

    if (!creds.calendarUrl) {
      return { client, calendar: calendars[0] };
    }

    // Matched by the calendar's own (server-assigned, stable) URL, not a
    // human-typed display name — no encoding/mismatch class of bug, since
    // this value is never typed by hand (see schema.ts).
    const calendar = calendars.find((c) => c.url === creds.calendarUrl);
    if (!calendar) {
      throw new CalendarUrlMismatchError(
        creds.calendarUrl,
        calendars.map((c) => c.url),
      );
    }

    return { client, calendar };
  }

  // `timeZone` is the requesting user's own timezone (see chat.tools.ts) —
  // event times are returned already formatted for it (explicit UTC
  // offset, never raw UTC) so the model never has to convert timezones
  // itself. See zoned-time.ts / devlog day 12.
  async listEvents(userId: string, range: { start: Date; end: Date }, timeZone: string) {
    assertValidTimeZone(timeZone);
    const { client, calendar } = await this.connect(userId);
    const objects = await client.fetchCalendarObjects({
      calendar,
      expand: true,
      timeRange: { start: range.start.toISOString(), end: range.end.toISOString() },
    });

    return objects.flatMap((object) => {
      if (!object.data) return [];
      try {
        return [parseEventIcs(object.data as string, timeZone)];
      } catch {
        return [];
      }
    });
  }

  // Used to build a human-readable confirmation preview before an
  // update/delete executes — see pending-actions.ts.
  async getEvent(userId: string, uid: string, timeZone: string) {
    assertValidTimeZone(timeZone);
    const { client, calendar } = await this.connect(userId);
    const object = await this.findObjectByUid(client, calendar, uid);
    return parseEventIcs(object.data as string, timeZone);
  }

  async createEvent(userId: string, input: EventInput): Promise<{ uid: string }> {
    const { client, calendar } = await this.connect(userId);
    const uid = randomUUID();
    await client.createCalendarObject({
      calendar,
      iCalString: buildEventIcs(uid, input),
      filename: `${uid}.ics`,
    });
    return { uid };
  }

  async updateEvent(userId: string, uid: string, input: Partial<EventInput>): Promise<void> {
    const { client, calendar } = await this.connect(userId);
    const object = await this.findObjectByUid(client, calendar, uid);
    await client.updateCalendarObject({
      calendarObject: { ...object, data: updateEventIcs(object.data as string, input) },
    });
  }

  async deleteEvent(userId: string, uid: string): Promise<void> {
    const { client, calendar } = await this.connect(userId);
    const object = await this.findObjectByUid(client, calendar, uid);
    await client.deleteCalendarObject({ calendarObject: object });
  }

  // Matched by the iCalendar UID inside each object's body, not by resource
  // filename — CalDAV doesn't guarantee a resource's filename equals its
  // event UID (only events this service created itself, via
  // `${uid}.ics`, are guaranteed to match that way; events from any other
  // client wouldn't).
  private async findObjectByUid(client: DAVClient, calendar: DAVCalendar, uid: string) {
    const objects = await client.fetchCalendarObjects({ calendar });
    for (const object of objects) {
      if (!object.data) continue;
      try {
        // Timezone is irrelevant here — only the uid is used.
        if (parseEventIcs(object.data as string, 'UTC').uid === uid) return object;
      } catch {
        continue;
      }
    }
    throw new CalendarEventNotFoundError(uid);
  }
}
