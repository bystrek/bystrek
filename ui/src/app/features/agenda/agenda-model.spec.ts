import { CalendarEvent } from '../../core/calendar/calendar.service';
import { buildAgendaRows, dayBounds, formatDuration, shiftDay } from './agenda-model';

const event = (uid: string, start: string, end: string, summary = uid): CalendarEvent => ({
  uid,
  summary,
  start,
  end,
  startWeekday: 'THU',
});

describe('agenda model', () => {
  const now = new Date('2025-10-22T10:00:00+02:00');

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
        uid: 'early',
        start: '2025-10-22T09:00:00+02:00',
        time: '09:00',
        title: 'early',
        status: 'past',
      },
      {
        kind: 'event',
        uid: 'tight',
        start: '2025-10-22T09:35:00+02:00',
        time: '09:35',
        title: 'tight',
        status: 'past',
      },
      { kind: 'gap', key: 'gap-late', minutes: 255 },
      {
        kind: 'event',
        uid: 'late',
        start: '2025-10-22T14:00:00+02:00',
        time: '14:00',
        title: 'late',
        status: 'next',
      },
    ]);
  });

  it('computes wall-clock day bounds and crosses month boundaries', () => {
    expect(dayBounds('2025-10-31')).toEqual({
      start: '2025-10-31T00:00:00',
      end: '2025-11-01T00:00:00',
    });
    expect(shiftDay('2025-10-31', 1)).toBe('2025-11-01');
    expect(shiftDay('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('formats durations for free gaps', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(150)).toBe('2h 30m');
  });
});
