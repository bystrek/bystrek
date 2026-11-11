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

// A few minutes ahead is clock skew between the device and the server, not a misread time.
const SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Span {
  start: Date;
  end: Date | null;
}

// Everything in a diary has already happened, but models read "at 7" typed at 06:30 as 07:00
// today. A start up to a day after `capturedAt` moves to the latest past time it can mean: a
// morning hour may be a 12-hour clock reading, so 07:00 becomes 19:00 the day before; any
// other hour becomes the same hour the day before. The end moves by the same wall-clock
// amount, and both keep their hour across a DST change. Anything further ahead is left for
// the user to correct.
export function intoPast(span: Span, capturedAt: Date, timeZone: string): Span {
  const ahead = span.start.getTime() - capturedAt.getTime();
  if (ahead <= SKEW_MS || ahead > DAY_MS) return span;
  const moveBack = (date: Date, hours: number) =>
    fromEpochMs(
      zonedDateTime(date, timeZone)
        .toPlainDateTime()
        .subtract({ days: 1 })
        .add({ hours })
        .toZonedDateTime(timeZone).epochMilliseconds,
    );
  const morning = zonedDateTime(span.start, timeZone).hour < 12;
  const hours = morning && moveBack(span.start, 12) <= capturedAt ? 12 : 0;
  return { start: moveBack(span.start, hours), end: span.end && moveBack(span.end, hours) };
}
