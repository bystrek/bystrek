import { Temporal } from '@js-temporal/polyfill';
import type { CalendarEvent } from '../../core/calendar/calendar.service';

export const MIN_GAP_MINUTES = 15;

export type AgendaRow =
  | {
      kind: 'event';
      key: string;
      uid: string;
      start: string;
      time: string;
      title: string;
      status: 'past' | 'next' | 'upcoming';
    }
  | { kind: 'gap'; key: string; minutes: number };

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// en-GB gives the day-first order used in the agenda design ("FRI 24 OCT"),
// regardless of the browser's default locale.
export function formatDayLabel(day: Temporal.PlainDate): string {
  return day
    .toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

// The API formats times in the account timezone, so the wall-clock digits are read as written.
export function clockTime(iso: string): string {
  return Temporal.PlainTime.from(iso).toString({ smallestUnit: 'minute' });
}

export function minutesUntil(iso: string, now: Temporal.Instant): number {
  const minutes = now.until(Temporal.Instant.from(iso)).total({ unit: 'minutes' });
  return Math.max(0, Math.round(minutes));
}

// Recurring occurrences share a UID, so keys combine the UID with the start time.
export function occurrenceKey(event: CalendarEvent): string {
  return `${event.uid}@${event.start}`;
}

// Gaps are only shown between events, not before the first or after the last.
export function buildAgendaRows(events: CalendarEvent[], now: Temporal.Instant): AgendaRow[] {
  const sorted = events
    .map((event) => ({
      event,
      start: Temporal.Instant.from(event.start),
      end: Temporal.Instant.from(event.end),
    }))
    .sort((a, b) => Temporal.Instant.compare(a.start, b.start));
  const nextIndex = sorted.findIndex(({ start }) => Temporal.Instant.compare(start, now) >= 0);

  const rows: AgendaRow[] = [];
  let previousEnd: Temporal.Instant | null = null;
  sorted.forEach(({ event, start, end }, index) => {
    if (previousEnd !== null) {
      const gap = Math.round(previousEnd.until(start).total({ unit: 'minutes' }));
      if (gap >= MIN_GAP_MINUTES) {
        rows.push({ kind: 'gap', key: `gap-${occurrenceKey(event)}`, minutes: gap });
      }
    }
    rows.push({
      kind: 'event',
      key: occurrenceKey(event),
      uid: event.uid,
      start: event.start,
      time: clockTime(event.start),
      title: event.summary,
      status:
        Temporal.Instant.compare(end, now) <= 0
          ? 'past'
          : index === nextIndex
            ? 'next'
            : 'upcoming',
    });
    previousEnd = end;
  });
  return rows;
}
