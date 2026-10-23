import type { CalendarEvent } from '../../core/calendar/calendar.service';
import { clockTime } from './agenda-dates';

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

export function minutesUntil(iso: string, now: Date): number {
  return Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60000));
}

// Recurring occurrences share a UID, so keys combine the UID with the start time.
export function occurrenceKey(event: CalendarEvent): string {
  return `${event.uid}@${event.start}`;
}

// Gaps are only shown between events, not before the first or after the last.
export function buildAgendaRows(events: CalendarEvent[], now: Date): AgendaRow[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nowMs = now.getTime();
  const nextIndex = sorted.findIndex((e) => Date.parse(e.start) >= nowMs);

  const rows: AgendaRow[] = [];
  let previousEnd: number | null = null;
  sorted.forEach((event, index) => {
    const startMs = Date.parse(event.start);
    const endMs = Date.parse(event.end);
    if (previousEnd !== null) {
      const gap = Math.round((startMs - previousEnd) / 60000);
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
      status: endMs <= nowMs ? 'past' : index === nextIndex ? 'next' : 'upcoming',
    });
    previousEnd = endMs;
  });
  return rows;
}
