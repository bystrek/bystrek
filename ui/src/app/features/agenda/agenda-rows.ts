import { Temporal } from '@js-temporal/polyfill';
import type { CalendarEvent } from '../../core/calendar/calendar.service';
import { pipe } from '../../core/functional/pipe';
import { clockTime } from './agenda-format';

const MIN_GAP_MINUTES = 15;

export const EventStatus = {
  PAST: 'past',
  NEXT: 'next',
  UPCOMING: 'upcoming',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const AgendaRowKind = {
  EVENT: 'event',
  GAP: 'gap',
} as const;

export type AgendaRowKind = (typeof AgendaRowKind)[keyof typeof AgendaRowKind];

export type AgendaRow =
  | {
      kind: typeof AgendaRowKind.EVENT;
      key: string;
      uid: string;
      start: string;
      time: string;
      title: string;
      status: EventStatus;
    }
  | { kind: typeof AgendaRowKind.GAP; key: string; minutes: number };

type EventRow = Extract<AgendaRow, { kind: typeof AgendaRowKind.EVENT }>;

type Timed = { event: CalendarEvent; start: Temporal.Instant; end: Temporal.Instant };

type Slot = { row: EventRow; start: Temporal.Instant; end: Temporal.Instant };

function sortByStart(events: CalendarEvent[]): Timed[] {
  return events
    .map((event) => ({
      event,
      start: Temporal.Instant.from(event.start),
      end: Temporal.Instant.from(event.end),
    }))
    .sort((a, b) => Temporal.Instant.compare(a.start, b.start));
}

function statusOf(
  end: Temporal.Instant,
  index: number,
  nextIndex: number,
  now: Temporal.Instant,
): EventStatus {
  if (Temporal.Instant.compare(end, now) <= 0) return EventStatus.PAST;
  if (index === nextIndex) return EventStatus.NEXT;
  return EventStatus.UPCOMING;
}

// Recurring occurrences share a UID, so keys combine the UID with the start time.
function buildEventRows(timed: Timed[], now: Temporal.Instant): Slot[] {
  const nextIndex = timed.findIndex(({ start }) => Temporal.Instant.compare(start, now) >= 0);
  return timed.map(({ event, start, end }, index) => ({
    row: {
      kind: AgendaRowKind.EVENT,
      key: `${event.uid}@${event.start}`,
      uid: event.uid,
      start: event.start,
      time: clockTime(event.start),
      title: event.summary,
      status: statusOf(end, index, nextIndex, now),
    },
    start,
    end,
  }));
}

// Measured from the latest end among earlier events, so overlaps don't produce false gaps.
function gapBefore(earlier: Slot[], start: Temporal.Instant, key: string): AgendaRow | null {
  const latestEnd = earlier.reduce<Temporal.Instant | null>(
    (latest, { end }) =>
      latest === null || Temporal.Instant.compare(end, latest) > 0 ? end : latest,
    null,
  );
  if (latestEnd === null) return null;
  const minutes = Math.round(latestEnd.until(start).total({ unit: 'minutes' }));
  return minutes >= MIN_GAP_MINUTES
    ? { kind: AgendaRowKind.GAP, key: `gap-${key}`, minutes }
    : null;
}

function addGaps(slots: Slot[]): AgendaRow[] {
  return slots.flatMap((slot, index) => {
    const gap = gapBefore(slots.slice(0, index), slot.start, slot.row.key);
    return gap === null ? [slot.row] : [gap, slot.row];
  });
}

// Gaps are only shown between events, not before the first or after the last.
export function buildAgendaRows(events: CalendarEvent[], now: Temporal.Instant): AgendaRow[] {
  // prettier-ignore
  return pipe(
    events,
    sortByStart,
    (timed) => buildEventRows(timed, now),
    addGaps,
  );
}
