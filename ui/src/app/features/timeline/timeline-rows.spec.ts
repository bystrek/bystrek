import { Temporal } from '@js-temporal/polyfill';
import { CalendarEvent } from '../../core/calendar/calendar.service';
import { DiaryEvent, DiaryEventSource } from '../../core/diary/diary.service';
import {
  EventStatus,
  RowShape,
  RowSource,
  TimelineDay,
  TimelineRowKind,
  buildTimelineRows,
} from './timeline-rows';

const event = (uid: string, start: string, end: string, summary = uid): CalendarEvent => ({
  uid,
  summary,
  start,
  end,
  startWeekday: 'THU',
});

// The diary API answers in UTC, so these are written in UTC too (Warsaw is +02:00 on these days).
const logged = (
  id: string,
  occurredAt: string,
  endsAt: string | null = null,
  source: DiaryEventSource = DiaryEventSource.MANUAL,
): DiaryEvent => ({
  id,
  noteId: null,
  text: id,
  occurredAt,
  endsAt,
  source,
  category: null,
});

const on = (day: string, now: string): TimelineDay => ({
  day: Temporal.PlainDate.from(day),
  timeZone: 'Europe/Warsaw',
  now: Temporal.Instant.from(now),
});

const today = on('2025-10-22', '2025-10-22T10:00:00+02:00');

const titles = (rows: ReturnType<typeof buildTimelineRows>) =>
  rows.map((row) => (row.kind === TimelineRowKind.GAP ? `gap ${row.minutes}` : row.title));

describe('timeline rows', () => {
  it('gives recurring occurrences that share a UID distinct row keys', () => {
    const rows = buildTimelineRows(
      [
        event('series', '2026-05-04T09:00:00+02:00', '2026-05-04T10:00:00+02:00'),
        event('series', '2026-05-05T09:00:00+02:00', '2026-05-05T10:00:00+02:00'),
      ],
      [],
      on('2026-05-04', '2026-05-04T08:00:00+02:00'),
    );
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(3);
  });

  it('measures gaps from the latest earlier end, so an overlapping event does not shorten them', () => {
    const rows = buildTimelineRows(
      [
        event('long', '2025-10-22T09:00:00+02:00', '2025-10-22T12:00:00+02:00'),
        event('short', '2025-10-22T09:30:00+02:00', '2025-10-22T09:45:00+02:00'),
        event('after', '2025-10-22T13:00:00+02:00', '2025-10-22T14:00:00+02:00'),
      ],
      [],
      today,
    );

    expect(rows.filter((row) => row.kind === TimelineRowKind.GAP)).toEqual([
      { kind: TimelineRowKind.GAP, key: 'gap-after@2025-10-22T13:00:00+02:00', minutes: 60 },
    ]);
  });

  it('marks past, next and upcoming events and shows gaps only between events', () => {
    const rows = buildTimelineRows(
      [
        event('late', '2025-10-22T14:00:00+02:00', '2025-10-22T15:00:00+02:00'),
        event('early', '2025-10-22T09:00:00+02:00', '2025-10-22T09:30:00+02:00'),
        event('tight', '2025-10-22T09:35:00+02:00', '2025-10-22T09:45:00+02:00'),
      ],
      [],
      today,
    );

    const calendarRow = (uid: string, start: string, time: string, status: EventStatus) => ({
      kind: TimelineRowKind.EVENT,
      key: `${uid}@${start}`,
      source: RowSource.CALENDAR,
      shape: RowShape.SPAN,
      start,
      time,
      until: null,
      title: uid,
      status,
    });

    expect(rows).toEqual([
      calendarRow('early', '2025-10-22T09:00:00+02:00', '09:00', EventStatus.PAST),
      calendarRow('tight', '2025-10-22T09:35:00+02:00', '09:35', EventStatus.PAST),
      { kind: TimelineRowKind.GAP, key: 'gap-late@2025-10-22T14:00:00+02:00', minutes: 255 },
      calendarRow('late', '2025-10-22T14:00:00+02:00', '14:00', EventStatus.NEXT),
    ]);
  });

  it('builds no rows for an empty day', () => {
    expect(buildTimelineRows([], [], today)).toEqual([]);
  });

  it('merges logged events by start, in the account timezone, without a status', () => {
    const rows = buildTimelineRows(
      [event('standup', '2025-10-22T09:00:00+02:00', '2025-10-22T09:15:00+02:00')],
      [
        logged('coffee', '2025-10-22T06:30:00Z'),
        logged('run', '2025-10-22T05:00:00Z', '2025-10-22T05:45:00Z', DiaryEventSource.HEALTH),
      ],
      today,
    );

    expect(rows).toEqual([
      {
        kind: TimelineRowKind.EVENT,
        key: 'diary-run',
        source: RowSource.HEALTH,
        shape: RowShape.SPAN,
        start: '2025-10-22T05:00:00Z',
        time: '07:00',
        until: '07:45',
        title: 'run',
        status: null,
      },
      {
        kind: TimelineRowKind.EVENT,
        key: 'diary-coffee',
        source: RowSource.MANUAL,
        shape: RowShape.POINT,
        start: '2025-10-22T06:30:00Z',
        time: '08:30',
        until: null,
        title: 'coffee',
        status: null,
      },
      expect.objectContaining({ title: 'standup', status: EventStatus.PAST }),
    ]);
  });

  it('keeps points between spans and overlapping spans in start order', () => {
    const rows = buildTimelineRows(
      [event('meeting', '2025-10-22T11:00:00+02:00', '2025-10-22T12:00:00+02:00')],
      [
        logged('lunch', '2025-10-22T09:30:00Z'),
        logged('walk', '2025-10-22T09:45:00Z', '2025-10-22T10:30:00Z'),
        logged('podcast', '2025-10-22T09:50:00Z', '2025-10-22T10:20:00Z'),
      ],
      today,
    );

    expect(titles(rows)).toEqual(['meeting', 'lunch', 'walk', 'podcast']);
  });

  it('computes gaps from calendar events only, so logged events do not split free time', () => {
    const rows = buildTimelineRows(
      [
        event('first', '2025-10-22T09:00:00+02:00', '2025-10-22T10:00:00+02:00'),
        event('second', '2025-10-22T13:00:00+02:00', '2025-10-22T14:00:00+02:00'),
      ],
      [
        logged('note', '2025-10-22T09:00:00Z'),
        logged('nap', '2025-10-22T09:30:00Z', '2025-10-22T10:30:00Z'),
      ],
      today,
    );

    expect(titles(rows)).toEqual(['first', 'note', 'nap', 'gap 180', 'second']);
  });

  it('keeps a span that ends exactly at midnight on the day it ends', () => {
    // 22:00 → 00:00 Warsaw time: it ends as the 22nd ends, so it belongs to the 22nd.
    const evening = logged('party', '2025-10-22T20:00:00Z', '2025-10-22T22:00:00Z');

    expect(titles(buildTimelineRows([], [evening], today))).toEqual(['party']);
  });

  it('shows an overnight span on the day it ends, not the day it starts', () => {
    // 23:40 → 07:10 Warsaw time, overlapping both days.
    const lastNight = logged('sleep', '2025-10-21T21:40:00Z', '2025-10-22T05:10:00Z');
    const tonight = logged('sleep again', '2025-10-22T21:40:00Z', '2025-10-23T05:10:00Z');

    const rows = buildTimelineRows([], [lastNight, tonight], today);

    expect(rows).toEqual([
      expect.objectContaining({ title: 'sleep', time: '23:40', until: '07:10' }),
    ]);
    expect(
      titles(buildTimelineRows([], [lastNight], on('2025-10-21', '2025-10-21T10:00Z'))),
    ).toEqual([]);
  });
});
