// Day keys ("YYYY-MM-DD") and wall-clock helpers for the agenda. The account
// timezone decides which day an instant falls on; the browser timezone never does.
// Temporal is imported from the polyfill because Safari has no native support yet.
import { Temporal } from '@js-temporal/polyfill';

// The account's calendar day (YYYY-MM-DD) for an instant.
export function zonedDateKey(instant: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

export function shiftDay(key: string, days: number): string {
  return Temporal.PlainDate.from(key).add({ days }).toString();
}

// Wall-clock bounds without an offset: the API reads these in the user's timezone.
export function dayBounds(key: string): { start: string; end: string } {
  const day = Temporal.PlainDate.from(key);
  return {
    start: day.toPlainDateTime().toString(),
    end: day.add({ days: 1 }).toPlainDateTime().toString(),
  };
}

// en-GB gives the day-first order used in the agenda design ("FRI 24 OCT"),
// regardless of the browser's default locale.
export function formatDayLabel(key: string): string {
  return Temporal.PlainDate.from(key)
    .toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

// The API formats times in the account timezone, so the clock digits are read directly.
export function clockTime(iso: string): string {
  return iso.slice(11, 16);
}
