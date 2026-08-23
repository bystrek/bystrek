import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createDAVClient, type DAVCalendar } from 'tsdav';

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;
import { CalendarCredentialsService } from './calendar-credentials.service';
import { buildEventIcs, parseEventIcs, updateEventIcs, type EventInput } from './ical-event';

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('no calendar connected — set it up on the profile page first');
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
    const creds = await this.credentials.get(userId);
    if (!creds) throw new CalendarNotConfiguredError();

    const client = await createDAVClient({
      serverUrl: creds.caldavUrl,
      credentials: { username: creds.username, password: creds.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();
    const calendar = creds.calendarName
      ? calendars.find((c) => c.displayName === creds.calendarName)
      : calendars[0];
    if (!calendar) {
      throw new CalendarNotConfiguredError();
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

  private async findObjectByUid(client: DAVClient, calendar: DAVCalendar, uid: string) {
    const objects = await client.fetchCalendarObjects({ calendar });
    const object = objects.find((o) => o.url.endsWith(`${uid}.ics`));
    if (!object) throw new CalendarEventNotFoundError(uid);
    return object;
  }
}
