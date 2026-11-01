import { describe, expect, it, mock } from 'bun:test';
import type { CaldavTransport } from './caldav-transport';
import { CaldavPreconditionFailedError } from './caldav-transport';
import type { CalendarCredentialsService } from './calendar-credentials.service';
import type { CalendarDiscovery } from './calendar-discovery';
import type { CalendarSyncService, StoredObject } from './calendar-sync.service';
import { CalendarChangedError } from './calendar.errors';
import { CalendarService } from './calendar.service';

function icsFor(uid: string, summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    'DTSTART:20260901T100000Z',
    'DTEND:20260901T110000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function stored(uid: string, ics: string): StoredObject {
  return { href: `/cal/personal/${uid}.ics`, etag: `"${uid}-1"`, uid, ics };
}

// The local copy, already checked against the server: the sync engine filters by uid.
function fakeSync(objects: StoredObject[]) {
  const checkedObjects = mock((_userId: string, filter: { uid?: string } = {}) =>
    Promise.resolve(objects.filter((o) => filter.uid === undefined || o.uid === filter.uid)),
  );
  const writeTarget = mock((_userId: string, uid?: string) =>
    Promise.resolve({
      target: {
        calendarUrl: 'https://dav.example.com/cal/personal/',
        username: 'u',
        password: 'p',
      },
      object: objects.find((o) => o.uid === uid),
    }),
  );
  return {
    sync: { checkedObjects, writeTarget } as unknown as CalendarSyncService,
    checkedObjects,
  };
}

function service(objects: StoredObject[], transport: Partial<CaldavTransport> = {}) {
  const { sync, checkedObjects } = fakeSync(objects);
  return {
    service: new CalendarService(
      {} as CalendarCredentialsService,
      {} as CalendarDiscovery,
      sync,
      transport as CaldavTransport,
    ),
    checkedObjects,
  };
}

describe('CalendarService', () => {
  it('looks an event up by its iCalendar UID in the checked copy', async () => {
    const { service: calendar, checkedObjects } = service([
      stored('real-uid-1', icsFor('real-uid-1', 'Dentist')),
    ]);

    const event = await calendar.getEvent('user-1', 'real-uid-1', 'UTC');
    expect(event.summary).toBe('Dentist');
    expect(checkedObjects).toHaveBeenCalledWith('user-1', { uid: 'real-uid-1' });
  });

  it('formats getEvent/listEvents times in the requested timezone, not raw UTC', async () => {
    // DTSTART/DTEND in icsFor are 10:00/11:00 UTC — confirms the timezone
    // argument is actually applied, not just accepted and ignored.
    const { service: calendar } = service([stored('e1', icsFor('e1', 'Standup'))]);

    const event = await calendar.getEvent('user-1', 'e1', 'Europe/Warsaw');
    expect(event.start).toBe('2026-09-01T12:00:00+02:00');

    const [listed] = await calendar.listEvents(
      'user-1',
      { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-02T00:00:00Z') },
      'Europe/Warsaw',
    );
    expect(listed.start).toBe('2026-09-01T12:00:00+02:00');
  });

  it('expands a stored series master into its occurrences', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly',
      'SUMMARY:Weekly sync',
      'DTSTART:20261010T100000Z',
      'DTEND:20261010T110000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=SA',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const { service: calendar } = service([stored('weekly', ics)]);

    const range = {
      start: new Date('2026-10-17T00:00:00Z'),
      end: new Date('2026-10-19T00:00:00Z'),
    };
    const events = await calendar.listEvents('user-1', range, 'Europe/Warsaw');
    expect(events).toHaveLength(1);
    expect(events[0].start).toBe('2026-10-17T12:00:00+02:00');
    expect(events[0].startWeekday).toBe('Saturday');

    const occurrence = await calendar.getEvent(
      'user-1',
      'weekly',
      'Europe/Warsaw',
      new Date(events[0].start),
    );
    expect(occurrence.start).toBe(events[0].start);

    await expect(
      calendar.getEvent('user-1', 'weekly', 'Europe/Warsaw', new Date('2026-10-18T10:00:00Z')),
    ).rejects.toThrow('no event found with uid "weekly"');
  });

  it('getEvent selects a moved exception by its moved time and a cancelled one not at all', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly',
      'SUMMARY:Weekly sync',
      'DTSTART:20261010T100000Z',
      'DTEND:20261010T110000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=SA',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:weekly',
      'RECURRENCE-ID:20261017T100000Z',
      'SUMMARY:Moved sync',
      'DTSTART:20261017T120000Z',
      'DTEND:20261017T130000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:weekly',
      'RECURRENCE-ID:20261024T100000Z',
      'DTSTART:20261024T100000Z',
      'DTEND:20261024T110000Z',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const { service: calendar } = service([stored('weekly', ics)]);

    const moved = await calendar.getEvent(
      'user-1',
      'weekly',
      'Europe/Warsaw',
      new Date('2026-10-17T12:00:00Z'),
    );
    expect(moved).toMatchObject({ summary: 'Moved sync', start: '2026-10-17T14:00:00+02:00' });

    await expect(
      calendar.getEvent('user-1', 'weekly', 'Europe/Warsaw', new Date('2026-10-17T10:00:00Z')),
    ).rejects.toThrow('no event found with uid "weekly"');
    await expect(
      calendar.getEvent('user-1', 'weekly', 'Europe/Warsaw', new Date('2026-10-24T10:00:00Z')),
    ).rejects.toThrow('no event found with uid "weekly"');
  });

  it('throws CalendarEventNotFoundError when no object matches the UID', async () => {
    const { service: calendar } = service([stored('other', icsFor('other', 'Other'))]);

    await expect(calendar.getEvent('user-1', 'missing-uid', 'UTC')).rejects.toThrow(
      'no event found with uid "missing-uid"',
    );
  });

  it('rejects an invalid timeZone up front, before reading the calendar, and never masks it as an empty list', async () => {
    const { service: calendar, checkedObjects } = service([]);

    await expect(
      calendar.listEvents('user-1', { start: new Date(), end: new Date() }, 'Not/A_Real_Zone'),
    ).rejects.toThrow('invalid IANA timezone');
    await expect(calendar.getEvent('user-1', 'e1', 'Not/A_Real_Zone')).rejects.toThrow(
      'invalid IANA timezone',
    );
    expect(checkedObjects).not.toHaveBeenCalled();
  });

  it('expands every window of a snapshot from one check of the copy', async () => {
    const { service: calendar, checkedObjects } = service([stored('e1', icsFor('e1', 'Standup'))]);

    const snapshot = await calendar.openSnapshot('user-1', 'UTC');
    snapshot.listEvents({ start: new Date('2026-08-01Z'), end: new Date('2026-09-01Z') });
    const [event] = snapshot.listEvents({
      start: new Date('2026-09-01Z'),
      end: new Date('2026-10-01Z'),
    });
    expect(event.uid).toBe('e1');
    expect(checkedObjects).toHaveBeenCalledTimes(1);
  });

  it('sends an update with the stored etag and reports a lost race as a changed event', async () => {
    const updateObject = mock(() => Promise.reject(new CaldavPreconditionFailedError()));
    const { service: calendar } = service([stored('e1', icsFor('e1', 'Standup'))], {
      updateObject,
    });

    await expect(calendar.updateEvent('user-1', 'e1', { summary: 'Renamed' })).rejects.toThrow(
      CalendarChangedError,
    );
    expect(updateObject).toHaveBeenCalledWith(
      expect.anything(),
      '/cal/personal/e1.ics',
      '"e1-1"',
      expect.stringContaining('SUMMARY:Renamed'),
    );
  });
});
