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

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

// Wall-clock bounds without an offset: the API reads these in the user's timezone.
export function dayBounds(key: string): { start: string; end: string } {
  return { start: `${key}T00:00:00`, end: `${shiftDay(key, 1)}T00:00:00` };
}

export function formatDayLabel(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parseDateKey(key))
    .toUpperCase();
}

// Times come back in the user's timezone, so the clock digits are read directly.
export function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
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

export function minutesUntil(iso: string, now: Date): number {
  return Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60000));
}
