import { Temporal } from '@js-temporal/polyfill';
import { CalendarEvent } from '../../core/calendar/calendar.service';
import { AgendaRowKind, buildAgendaRows, EventStatus } from './agenda-rows';

const event = (uid: string, start: string, end: string, summary = uid): CalendarEvent => ({
  uid,
  summary,
  start,
  end,
  startWeekday: 'THU',
});

describe('agenda rows', () => {
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

  it('measures gaps from the latest earlier end, so an overlapping event does not shorten them', () => {
    const rows = buildAgendaRows(
      [
        event('long', '2025-10-22T09:00:00+02:00', '2025-10-22T12:00:00+02:00'),
        event('short', '2025-10-22T09:30:00+02:00', '2025-10-22T09:45:00+02:00'),
        event('after', '2025-10-22T13:00:00+02:00', '2025-10-22T14:00:00+02:00'),
      ],
      now,
    );

    expect(rows.filter((row) => row.kind === AgendaRowKind.GAP)).toEqual([
      { kind: AgendaRowKind.GAP, key: 'gap-after@2025-10-22T13:00:00+02:00', minutes: 60 },
    ]);
  });

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
        kind: AgendaRowKind.EVENT,
        key: 'early@2025-10-22T09:00:00+02:00',
        uid: 'early',
        start: '2025-10-22T09:00:00+02:00',
        time: '09:00',
        title: 'early',
        status: EventStatus.PAST,
      },
      {
        kind: AgendaRowKind.EVENT,
        key: 'tight@2025-10-22T09:35:00+02:00',
        uid: 'tight',
        start: '2025-10-22T09:35:00+02:00',
        time: '09:35',
        title: 'tight',
        status: EventStatus.PAST,
      },
      {
        kind: AgendaRowKind.GAP,
        key: 'gap-late@2025-10-22T14:00:00+02:00',
        minutes: 255,
      },
      {
        kind: AgendaRowKind.EVENT,
        key: 'late@2025-10-22T14:00:00+02:00',
        uid: 'late',
        start: '2025-10-22T14:00:00+02:00',
        time: '14:00',
        title: 'late',
        status: EventStatus.NEXT,
      },
    ]);
  });
});
