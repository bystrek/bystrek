/// <reference lib="esnext.temporal" />
import { fromEpochMs, weekdayNameOf, zonedDateTime } from '../calendar/zoned-time';

// The user's wall clock as the prompt shows it, with the weekday so the model can resolve
// "on Monday": "Tuesday 2026-11-10 08:30".
export function describeLocalTime(date: Date, timeZone: string): string {
  const local = zonedDateTime(date, timeZone);
  const time = local.toPlainTime().toString({ smallestUnit: 'minute' });
  return `${weekdayNameOf(local.dayOfWeek)} ${local.toPlainDate().toString()} ${time}`;
}

// Wall-clock only: an offset or "Z" from the model would be a guess, not the user's zone.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

// A wall-clock time the model resolved ("2026-11-09T22:00") as the instant it denotes in the
// user's time zone. A time skipped by a DST change moves forward, a repeated one takes the
// earlier instant. Anything else, impossible dates included, is undefined.
export function localTimeToDate(value: string, timeZone: string): Date | undefined {
  if (!LOCAL_DATE_TIME.test(value)) return undefined;
  try {
    const local = Temporal.PlainDateTime.from(value, { overflow: 'reject' });
    return fromEpochMs(local.toZonedDateTime(timeZone).epochMilliseconds);
  } catch {
    return undefined;
  }
}
