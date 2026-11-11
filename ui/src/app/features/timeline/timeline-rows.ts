import { Temporal } from '@js-temporal/polyfill';
import type { CalendarEvent } from '../../core/calendar/calendar.service';
import { DiaryEvent, DiaryEventSource } from '../../core/diary/diary.service';
import { pipe } from '../../core/functional/pipe';
import { clockTime, clockTimeIn } from './timeline-format';

const MIN_GAP_MINUTES = 15;

export const EventStatus = {
  PAST: 'past',
  NEXT: 'next',
  UPCOMING: 'upcoming',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const TimelineRowKind = {
  EVENT: 'event',
  GAP: 'gap',
} as const;

export type TimelineRowKind = (typeof TimelineRowKind)[keyof typeof TimelineRowKind];

// Calendar events are scheduled; the others are what the user logged in the diary.
export const RowSource = {
  CALENDAR: 'calendar',
  ...DiaryEventSource,
} as const;

export type RowSource = (typeof RowSource)[keyof typeof RowSource];

export const RowShape = {
  POINT: 'point',
  SPAN: 'span',
} as const;

export type RowShape = (typeof RowShape)[keyof typeof RowShape];

// `status` is for calendar events only; `until` is the end of a logged span.
export type TimelineRow =
  | {
      kind: typeof TimelineRowKind.EVENT;
      key: string;
      source: RowSource;
      shape: RowShape;
      start: string;
      time: string;
      until: string | null;
      title: string;
      status: EventStatus | null;
    }
  | { kind: typeof TimelineRowKind.GAP; key: string; minutes: number };

type EventRow = Extract<TimelineRow, { kind: typeof TimelineRowKind.EVENT }>;
type GapRow = Extract<TimelineRow, { kind: typeof TimelineRowKind.GAP }>;

type Slot = { row: EventRow; start: Temporal.Instant; end: Temporal.Instant };

export type TimelineDay = {
  day: Temporal.PlainDate;
  timeZone: string;
  now: Temporal.Instant;
};

const byStart = (a: Slot, b: Slot): number => Temporal.Instant.compare(a.start, b.start);

function statusOf(slot: Slot, index: number, nextIndex: number, now: Temporal.Instant) {
  if (Temporal.Instant.compare(slot.end, now) <= 0) return EventStatus.PAST;
  if (index === nextIndex) return EventStatus.NEXT;
  return EventStatus.UPCOMING;
}

// Recurring occurrences share a UID, so keys combine the UID with the start time.
function calendarSlots(events: CalendarEvent[], now: Temporal.Instant): Slot[] {
  const slots = events
    .map((event) => ({
      row: {
        kind: TimelineRowKind.EVENT,
        key: `${event.uid}@${event.start}`,
        source: RowSource.CALENDAR,
        shape: RowShape.SPAN,
        start: event.start,
        time: clockTime(event.start),
        until: null,
        title: event.summary,
        status: null,
      },
      start: Temporal.Instant.from(event.start),
      end: Temporal.Instant.from(event.end),
    }))
    .sort(byStart);
  const nextIndex = slots.findIndex(({ start }) => Temporal.Instant.compare(start, now) >= 0);
  return slots.map((slot, index) => ({
    ...slot,
    row: { ...slot.row, status: statusOf(slot, index, nextIndex, now) },
  }));
}

// The API returns everything overlapping the day; a span belongs to the day it ends on,
// so last night's sleep shows today and tonight's shows tomorrow.
function endingBy(dayEnd: Temporal.Instant) {
  return (events: DiaryEvent[]): DiaryEvent[] =>
    events.filter(
      (event) =>
        Temporal.Instant.compare(Temporal.Instant.from(event.endsAt ?? event.occurredAt), dayEnd) <=
        0,
    );
}

// The day a logged event shows on, by the same rule: the day its end falls on, where a span
// ending at midnight ends the day before. A zero-length span is a point.
export function loggedDay(
  event: Pick<DiaryEvent, 'occurredAt' | 'endsAt'>,
  timeZone: string,
): Temporal.PlainDate {
  const end = Temporal.Instant.from(event.endsAt ?? event.occurredAt).toZonedDateTimeISO(timeZone);
  const day = end.toPlainDate();
  const endsAtMidnight =
    event.endsAt !== null &&
    Temporal.Instant.compare(
      Temporal.Instant.from(event.endsAt),
      Temporal.Instant.from(event.occurredAt),
    ) > 0 &&
    end.equals(end.startOfDay());
  return endsAtMidnight ? day.subtract({ days: 1 }) : day;
}

function loggedSlots(timeZone: string) {
  return (events: DiaryEvent[]): Slot[] =>
    events.map((event) => {
      const start = Temporal.Instant.from(event.occurredAt);
      return {
        row: {
          kind: TimelineRowKind.EVENT,
          key: `diary-${event.id}`,
          source: event.source,
          shape: event.endsAt === null ? RowShape.POINT : RowShape.SPAN,
          start: event.occurredAt,
          time: clockTimeIn(event.occurredAt, timeZone),
          until: event.endsAt === null ? null : clockTimeIn(event.endsAt, timeZone),
          title: event.text,
          status: null,
        },
        start,
        end: event.endsAt === null ? start : Temporal.Instant.from(event.endsAt),
      };
    });
}

// Measured from the latest end among earlier events, so overlaps don't produce false gaps.
function gapBefore(earlier: Slot[], slot: Slot): GapRow | null {
  const latestEnd = earlier.reduce<Temporal.Instant | null>(
    (latest, { end }) =>
      latest === null || Temporal.Instant.compare(end, latest) > 0 ? end : latest,
    null,
  );
  if (latestEnd === null) return null;
  const minutes = Math.round(latestEnd.until(slot.start).total({ unit: 'minutes' }));
  return minutes >= MIN_GAP_MINUTES
    ? { kind: TimelineRowKind.GAP, key: `gap-${slot.row.key}`, minutes }
    : null;
}

// Free time is between calendar events only, so logged events don't break it into noise.
// Each gap sits right before the calendar event that ends it.
function interleave(calendar: Slot[], logged: Slot[]): TimelineRow[] {
  const gaps = new Map(
    calendar.map((slot, index) => [slot.row.key, gapBefore(calendar.slice(0, index), slot)]),
  );
  return [...calendar, ...logged].sort(byStart).flatMap((slot) => {
    const gap = gaps.get(slot.row.key);
    return gap ? [gap, slot.row] : [slot.row];
  });
}

export function buildTimelineRows(
  calendar: CalendarEvent[],
  logged: DiaryEvent[],
  { day, timeZone, now }: TimelineDay,
): TimelineRow[] {
  const dayEnd = day.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  return interleave(
    calendarSlots(calendar, now),
    pipe(logged, endingBy(dayEnd), loggedSlots(timeZone)),
  );
}
