import { Temporal } from '@js-temporal/polyfill';

export function formatDuration(minutes: number): string {
  const { hours, minutes: rest } = Temporal.Duration.from({ minutes }).round({
    largestUnit: 'hour',
  });
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// en-GB gives the day-first order used in the agenda design ("FRI 24 OCT"),
// regardless of the browser's default locale.
export function toWeekdayAndDate(day: Temporal.PlainDate): string {
  return day
    .toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

// The API formats times in the account timezone, so the wall-clock digits are read as written.
export function clockTime(iso: string): string {
  return Temporal.PlainTime.from(iso).toString({ smallestUnit: 'minute' });
}

export function minutesUntil(iso: string, now: Temporal.Instant): number {
  const until = now.until(Temporal.Instant.from(iso));
  return Math.max(0, until.round({ largestUnit: 'minute', smallestUnit: 'minute' }).minutes);
}
