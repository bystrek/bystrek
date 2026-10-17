import { describe, expect, it } from 'bun:test';
import { buildEventIcs, parseEventIcs, parseEventOccurrences, updateEventIcs } from './ical-event';

function calendarWith(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

function eventWith(...properties: string[]): string {
  return ['BEGIN:VEVENT', ...properties, 'END:VEVENT'].join('\r\n');
}

const weekend = {
  start: new Date('2026-10-17T00:00:00Z'),
  end: new Date('2026-10-19T00:00:00Z'),
};

describe('buildEventIcs / parseEventIcs', () => {
  it('round-trips a simple event', () => {
    const start = new Date('2026-09-01T10:00:00Z');
    const end = new Date('2026-09-01T11:00:00Z');
    const ics = buildEventIcs('event-1', { summary: 'Dentist', start, end });

    const parsed = parseEventIcs(ics, 'UTC');
    expect(parsed.uid).toBe('event-1');
    expect(parsed.summary).toBe('Dentist');
    expect(new Date(parsed.start)).toEqual(start);
    expect(new Date(parsed.end)).toEqual(end);
    expect(parsed.rrule).toBeNull();
  });

  it('round-trips a recurring event with an RRULE', () => {
    const start = new Date('2026-09-01T10:00:00Z');
    const end = new Date('2026-09-01T11:00:00Z');
    const ics = buildEventIcs('event-2', {
      summary: 'Weekly sync',
      start,
      end,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    });

    const parsed = parseEventIcs(ics, 'UTC');
    expect(parsed.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');
  });

  it('formats start/end in the requested timezone, with an explicit offset', () => {
    const ics = buildEventIcs('event-tz', {
      summary: 'Standup',
      start: new Date('2026-08-24T04:00:00Z'),
      end: new Date('2026-08-24T04:15:00Z'),
    });

    const parsed = parseEventIcs(ics, 'Europe/Warsaw');
    expect(parsed.start).toBe('2026-08-24T06:00:00+02:00');
    expect(parsed.end).toBe('2026-08-24T06:15:00+02:00');
  });

  it('attaches English weekday labels for start/end in the requested timezone', () => {
    // Direct guard against issue #18: the model was deriving the weekday
    // from the ISO date itself and getting it wrong. Now the tool output
    // carries the day name, so it never has to derive it.
    const ics = buildEventIcs('event-weekday', {
      summary: 'Drag Race',
      start: new Date('2026-09-06T14:00:00Z'),
      end: new Date('2026-09-06T15:00:00Z'),
    });

    const parsed = parseEventIcs(ics, 'Europe/Warsaw');
    expect(parsed.start).toBe('2026-09-06T16:00:00+02:00');
    expect(parsed.startWeekday).toBe('Sunday');
    expect(parsed.endWeekday).toBe('Sunday');
  });

  it('includes optional description/location', () => {
    const ics = buildEventIcs('event-3', {
      summary: 'Trip',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T11:00:00Z'),
      description: 'Pack early',
      location: 'Airport',
    });

    const parsed = parseEventIcs(ics, 'UTC');
    expect(parsed.description).toBe('Pack early');
    expect(parsed.location).toBe('Airport');
  });
});

describe('updateEventIcs', () => {
  it('changes only the fields provided', () => {
    const original = buildEventIcs('event-4', {
      summary: 'Original',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T11:00:00Z'),
      location: 'Room 1',
    });

    const updated = updateEventIcs(original, { summary: 'Renamed' });
    const parsed = parseEventIcs(updated, 'UTC');

    expect(parsed.uid).toBe('event-4');
    expect(parsed.summary).toBe('Renamed');
    expect(parsed.location).toBe('Room 1');
  });

  it('adds an RRULE to a previously non-recurring event', () => {
    const original = buildEventIcs('event-5', {
      summary: 'Standup',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T10:15:00Z'),
    });

    const updated = updateEventIcs(original, { rrule: 'FREQ=DAILY' });
    expect(parseEventIcs(updated, 'UTC').rrule).toBe('FREQ=DAILY');
  });

  it('clears an RRULE when passed an empty string', () => {
    const original = buildEventIcs('event-6', {
      summary: 'Standup',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T10:15:00Z'),
      rrule: 'FREQ=DAILY',
    });

    const updated = updateEventIcs(original, { rrule: '' });
    expect(parseEventIcs(updated, 'UTC').rrule).toBeNull();
  });
});

describe('parseEventOccurrences', () => {
  it('does not report the original Tuesday of a weekly series for a weekend query', () => {
    const ics = calendarWith(
      eventWith(
        'UID:weekday',
        'SUMMARY:Weekly lesson',
        'DTSTART:20261013T170000Z',
        'DTEND:20261013T180000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=TU',
      ),
    );
    expect(parseEventOccurrences(ics, weekend, 'Europe/Warsaw')).toEqual([]);
  });

  it('returns the in-range occurrence of an unexpanded weekly series', () => {
    const ics = calendarWith(
      eventWith(
        'UID:weekend',
        'SUMMARY:Weekly sync',
        'DTSTART:20261010T100000Z',
        'DTEND:20261010T110000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=SA',
      ),
    );
    const events = parseEventOccurrences(ics, weekend, 'Europe/Warsaw');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: 'weekend',
      start: '2026-10-17T12:00:00+02:00',
      end: '2026-10-17T13:00:00+02:00',
      startWeekday: 'Saturday',
      rrule: 'FREQ=WEEKLY;BYDAY=SA',
    });
  });

  it('applies an overridden occurrence and an EXDATE', () => {
    const ics = calendarWith(
      eventWith(
        'UID:weekend',
        'SUMMARY:Weekly sync',
        'LOCATION:Room 1',
        'DTSTART:20261010T100000Z',
        'DTEND:20261010T110000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=SA',
        'EXDATE:20261024T100000Z',
      ),
      eventWith(
        'UID:weekend',
        'RECURRENCE-ID:20261017T100000Z',
        'SUMMARY:Moved sync',
        'DTSTART:20261017T120000Z',
        'DTEND:20261017T130000Z',
      ),
    );
    const events = parseEventOccurrences(
      ics,
      { start: weekend.start, end: new Date('2026-10-26T00:00:00Z') },
      'Europe/Warsaw',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      summary: 'Moved sync',
      location: 'Room 1',
      start: '2026-10-17T14:00:00+02:00',
      end: '2026-10-17T15:00:00+02:00',
    });
  });

  it('includes an exception moved into range from a later recurrence date', () => {
    const ics = calendarWith(
      eventWith(
        'UID:weekday',
        'SUMMARY:Weekly sync',
        'DTSTART:20261013T100000Z',
        'DTEND:20261013T110000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=TU',
      ),
      eventWith(
        'UID:weekday',
        'RECURRENCE-ID:20261020T100000Z',
        'SUMMARY:Moved to Monday',
        'DTSTART:20261019T100000Z',
        'DTEND:20261019T110000Z',
      ),
    );
    const events = parseEventOccurrences(
      ics,
      { start: new Date('2026-10-19T00:00:00Z'), end: new Date('2026-10-20T00:00:00Z') },
      'UTC',
    );
    expect(events.map((event) => event.summary)).toEqual(['Moved to Monday']);
  });

  it('omits a cancelled occurrence without suppressing the rest of its series', () => {
    const ics = calendarWith(
      eventWith(
        'UID:weekly',
        'SUMMARY:Weekly sync',
        'DTSTART:20261010T100000Z',
        'DTEND:20261010T110000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=SA',
      ),
      eventWith(
        'UID:weekly',
        'RECURRENCE-ID:20261017T100000Z',
        'DTSTART:20261017T100000Z',
        'DTEND:20261017T110000Z',
        'STATUS:CANCELLED',
      ),
    );
    const events = parseEventOccurrences(
      ics,
      { start: weekend.start, end: new Date('2026-10-25T00:00:00Z') },
      'UTC',
    );
    expect(events.map((event) => event.start)).toEqual(['2026-10-24T10:00:00+00:00']);
  });

  it('returns every VEVENT in an already-expanded response and omits cancelled events', () => {
    const ics = calendarWith(
      eventWith(
        'UID:expanded',
        'SUMMARY:First',
        'DTSTART:20261010T100000Z',
        'DTEND:20261010T110000Z',
      ),
      eventWith(
        'UID:expanded',
        'RECURRENCE-ID:20261017T100000Z',
        'SUMMARY:Second',
        'DTSTART:20261017T100000Z',
        'DTEND:20261017T110000Z',
      ),
      eventWith(
        'UID:expanded',
        'RECURRENCE-ID:20261018T100000Z',
        'SUMMARY:Third',
        'DTSTART:20261018T100000Z',
        'DTEND:20261018T110000Z',
      ),
      eventWith(
        'UID:expanded',
        'RECURRENCE-ID:20261024T100000Z',
        'SUMMARY:Cancelled',
        'DTSTART:20261024T100000Z',
        'DTEND:20261024T110000Z',
        'STATUS:CANCELLED',
      ),
    );
    expect(parseEventOccurrences(ics, weekend, 'UTC').map((event) => event.summary)).toEqual([
      'Second',
      'Third',
    ]);
  });

  it('includes an event that overlaps the start of the range', () => {
    const ics = calendarWith(
      eventWith(
        'UID:overnight',
        'SUMMARY:Overnight',
        'DTSTART:20261016T230000Z',
        'DTEND:20261017T010000Z',
      ),
    );
    expect(parseEventOccurrences(ics, weekend, 'UTC')).toHaveLength(1);
  });
});
