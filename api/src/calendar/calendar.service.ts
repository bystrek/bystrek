import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createDAVClient, type DAVCalendar } from 'tsdav';

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;
import { assertSafeCaldavUrl } from './caldav-url';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { buildEventIcs, parseEventIcs, updateEventIcs, type EventInput } from './ical-event';

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('no calendar connected — set it up on the profile page first');
  }
}

export class CalendarNameMismatchError extends Error {
  constructor(configuredName: string, availableNames: string[]) {
    super(
      `configured calendar name "${configuredName}" doesn't match any calendar on this account ` +
        `(available: ${availableNames.length ? availableNames.join(', ') : 'none'}) — ` +
        `fix the calendar name on the profile page, or clear it to use the first calendar`,
    );
  }
}

export class CalendarEventNotFoundError extends Error {
  constructor(uid: string) {
    super(`no event found with uid "${uid}"`);
  }
}

// Thin per-request wrapper: builds a tsdav DAVClient from the requesting
// user's stored CalDAV credentials and resolves their target calendar. No
// caching — chat's tool-call volume doesn't warrant it, and it keeps every
// call self-contained (no stale client across a long-lived credentials
// change).
@Injectable()
export class CalendarService {
  constructor(private readonly credentials: CalendarCredentialsService) {}

  private async connect(userId: string): Promise<{ client: DAVClient; calendar: DAVCalendar }> {
    const creds = await this.credentials.getInternal(userId);
    if (!creds) throw new CalendarNotConfiguredError();
    // Defense-in-depth alongside the store-time check in
    // CalendarCredentialsService — catches a row written before this check
    // existed, or by any other path that bypasses the service.
    assertSafeCaldavUrl(creds.caldavUrl);

    const client = await createDAVClient({
      serverUrl: creds.caldavUrl,
      credentials: { username: creds.username, password: creds.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();
    if (calendars.length === 0) {
      throw new CalendarNotConfiguredError();
    }

    const configuredName = creds.calendarName?.trim();
    if (!configuredName) {
      return { client, calendar: calendars[0] };
    }

    // Trimmed + Unicode-normalized (NFC) on both sides: a display name
    // typed into a browser and the same-looking string round-tripped
    // through a CalDAV server's XML response can differ in how accented
    // characters are encoded (precomposed vs. combining marks) while
    // rendering identically — a naive `===` silently fails on that.
    const normalize = (s: string) => s.trim().normalize('NFC');
    const target = normalize(configuredName);
    const calendar = calendars.find(
      (c) => typeof c.displayName === 'string' && normalize(c.displayName) === target,
    );
    if (!calendar) {
      throw new CalendarNameMismatchError(
        configuredName,
        calendars.map((c) => (typeof c.displayName === 'string' ? c.displayName : '(unnamed)')),
      );
    }

    return { client, calendar };
  }

  async listEvents(userId: string, range: { start: Date; end: Date }) {
    const { client, calendar } = await this.connect(userId);
    const objects = await client.fetchCalendarObjects({
      calendar,
      expand: true,
      timeRange: { start: range.start.toISOString(), end: range.end.toISOString() },
    });

    return objects.flatMap((object) => {
      if (!object.data) return [];
      try {
        return [parseEventIcs(object.data as string)];
      } catch {
        return [];
      }
    });
  }

  // Used to build a human-readable confirmation preview before an
  // update/delete executes — see pending-actions.ts.
  async getEvent(userId: string, uid: string) {
    const { client, calendar } = await this.connect(userId);
    const object = await this.findObjectByUid(client, calendar, uid);
    return parseEventIcs(object.data as string);
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
        if (parseEventIcs(object.data as string).uid === uid) return object;
      } catch {
        continue;
      }
    }
    throw new CalendarEventNotFoundError(uid);
  }
}
