import { Temporal } from '@js-temporal/polyfill';
import { CalendarEvent } from '../../core/calendar/calendar.service';
import { buildAgendaRows, clockTime, formatDuration } from './agenda-model';

const event = (uid: string, start: string, end: string, summary = uid): CalendarEvent => ({
  uid,
  summary,
  start,
  end,
  startWeekday: 'THU',
});

describe('agenda model', () => {
  it('gives recurring occurrences that share a UID distinct row keys', () => {
    const rows = buildAgendaRows(
      [
        event('series', '2026-05-04T09:00:00+02:00', '2026-05-04T10:00:00+02:00'),
        event('series', '2026-05-05T09:00:00+02:00', '2026-05-05T10:00:00+02:00'),
      ],
      Temporal.Instant.from('2026-05-04T08:00:00+02:00'),
    );
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(3);
  });

  const now = Temporal.Instant.from('2025-10-22T10:00:00+02:00');

  it('marks past, next and upcoming events and shows gaps only between events', () => {
    const rows = buildAgendaRows(
      [
        event('late', '2025-10-22T14:00:00+02:00', '2025-10-22T15:00:00+02:00'),
        event('early', '2025-10-22T09:00:00+02:00', '2025-10-22T09:30:00+02:00'),
        event('tight', '2025-10-22T09:35:00+02:00', '2025-10-22T09:45:00+02:00'),
      ],
      now,
    );

    expect(rows).toEqual([
      {
        kind: 'event',
        key: 'early@2025-10-22T09:00:00+02:00',
        uid: 'early',
        start: '2025-10-22T09:00:00+02:00',
        time: '09:00',
        title: 'early',
        status: 'past',
      },
      {
        kind: 'event',
        key: 'tight@2025-10-22T09:35:00+02:00',
        uid: 'tight',
        start: '2025-10-22T09:35:00+02:00',
        time: '09:35',
        title: 'tight',
        status: 'past',
      },
      {
        kind: 'gap',
        key: 'gap-late@2025-10-22T14:00:00+02:00',
        minutes: 255,
      },
      {
        kind: 'event',
        key: 'late@2025-10-22T14:00:00+02:00',
        uid: 'late',
        start: '2025-10-22T14:00:00+02:00',
        time: '14:00',
        title: 'late',
        status: 'next',
      },
    ]);
  });

  it('formats durations for free gaps', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(150)).toBe('2h 30m');
  });

  it('reads the wall-clock time without converting the offset', () => {
    expect(clockTime('2025-10-22T09:05:00+02:00')).toBe('09:05');
  });
});
