import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { CaldavPreconditionFailedError, CaldavTransport } from './caldav-transport';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarDiscovery, type CalendarSummary } from './calendar-discovery';
import { CalendarSyncService, type StoredObject } from './calendar-sync.service';
import {
  CalendarChangedError,
  CalendarEventNotFoundError,
  CalendarNotConfiguredError,
} from './calendar.errors';
import {
  buildEventIcs,
  parseEventIcs,
  parseEventOccurrences,
  updateEventIcs,
  type EventInput,
  type ParsedEvent,
} from './ical-event';
import { assertValidTimeZone, fromEpochMs, parseOffsetIso } from './zoned-time';

// The calendar as it was when one read checked it against the server, expanded per window
// in memory. Lets a forward search look at many windows for one CalDAV request.
export class CalendarSnapshot {
  private readonly logger = new Logger(CalendarSnapshot.name);

  constructor(
    private readonly objects: StoredObject[],
    private readonly timeZone: string,
  ) {}

  // `timeZone` is the requesting user's own timezone — event times are returned already
  // formatted for it (explicit UTC offset, never raw UTC). See zoned-time.ts / devlog day 12.
  // The copy keeps every object another client wrote, malformed ones included, so one that
  // fails to expand is logged and skipped rather than failing the whole read.
  listEvents(range: { start: Date; end: Date }): ParsedEvent[] {
    return this.objects.flatMap((object) => {
      try {
        return parseEventOccurrences(object.ics, range, this.timeZone);
      } catch (err) {
        this.logger.warn(`skipping unreadable calendar object ${object.href}: ${String(err)}`);
        return [];
      }
    });
  }
}

// Calendar reads come from the local copy (calendar-sync.service.ts), checked against the
// server first. Writes go straight to CalDAV.
@Injectable()
export class CalendarService {
  constructor(
    private readonly credentials: CalendarCredentialsService,
    private readonly discovery: CalendarDiscovery,
    private readonly sync: CalendarSyncService,
    private readonly transport: CaldavTransport,
  ) {}

  // Connects with raw, not-yet-saved credentials — backs the profile
  // page's "load calendars" step, so a user can pick a calendar before
  // anything is persisted. Never touches the database.
  previewCalendars(caldavUrl: string, username: string, password: string) {
    return this.discovery.listCalendars(caldavUrl, username, password);
  }

  async listConfiguredCalendars(userId: string): Promise<CalendarSummary[]> {
    const creds = await this.credentials.getInternal(userId);
    if (!creds) throw new CalendarNotConfiguredError();
    return this.previewCalendars(creds.caldavUrl, creds.username, creds.password);
  }

  async openSnapshot(userId: string, timeZone: string): Promise<CalendarSnapshot> {
    assertValidTimeZone(timeZone);
    return new CalendarSnapshot(await this.sync.checkedObjects(userId), timeZone);
  }

  async listEvents(userId: string, range: { start: Date; end: Date }, timeZone: string) {
    return (await this.openSnapshot(userId, timeZone)).listEvents(range);
  }

  // Used to build the event detail view for a single occurrence.
  async getEvent(userId: string, uid: string, timeZone: string, occurrence?: Date) {
    assertValidTimeZone(timeZone);
    // Matched by the iCalendar UID inside each object's body, not by resource
    // filename — CalDAV doesn't guarantee a resource's filename equals its
    // event UID (only events this service created itself, via `${uid}.ics`).
    const [object] = await this.sync.checkedObjects(userId, { uid });
    if (!object) throw new CalendarEventNotFoundError(uid);
    if (occurrence) {
      const matches = parseEventOccurrences(
        object.ics,
        { start: occurrence, end: fromEpochMs(occurrence.getTime() + 1) },
        timeZone,
      );
      const event = matches.find(
        (item) => parseOffsetIso(item.start).getTime() === occurrence.getTime(),
      );
      if (!event) throw new CalendarEventNotFoundError(uid);
      return event;
    }
    return parseEventIcs(object.ics, timeZone);
  }

  async createEvent(userId: string, input: EventInput): Promise<{ uid: string }> {
    const uid = randomUUID();
    await this.write(() =>
      this.sync.write(userId, (target) =>
        this.transport.createObject(target, `${uid}.ics`, buildEventIcs(uid, input)),
      ),
    );
    return { uid };
  }

  async updateEvent(userId: string, uid: string, input: Partial<EventInput>): Promise<void> {
    await this.write(() =>
      this.sync.writeObject(userId, uid, (target, object) =>
        this.transport.updateObject(
          target,
          object.href,
          object.etag,
          updateEventIcs(object.ics, input),
        ),
      ),
    );
  }

  async deleteEvent(userId: string, uid: string): Promise<void> {
    await this.write(() =>
      this.sync.writeObject(userId, uid, (target, object) =>
        this.transport.deleteObject(target, object.href, object.etag),
      ),
    );
  }

  private async write(request: () => Promise<void>): Promise<void> {
    try {
      await request();
    } catch (err) {
      if (err instanceof CaldavPreconditionFailedError) throw new CalendarChangedError();
      throw err;
    }
  }
}
