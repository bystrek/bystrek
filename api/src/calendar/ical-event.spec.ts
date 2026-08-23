import { describe, expect, it } from 'bun:test';
import { buildEventIcs, parseEventIcs, updateEventIcs } from './ical-event';

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
