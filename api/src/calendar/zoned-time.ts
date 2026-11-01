// Not included by default even at target: esnext — opt-in only.
/// <reference lib="esnext.temporal" />

// Temporal throws a low-level RangeError for an invalid IANA timezone;
// callers should validate once, up front, with a clear message instead.
export function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new Error(`invalid IANA timezone: "${timeZone}"`);
}

// For timezone names from calendar data, which may be non-IANA (e.g.
// Windows names) and need a fallback rather than an error.
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedDateTime(date: Date, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
}

// The only places outside specs and DB defaults allowed to construct a
// Date — `new Date(string)` reads an offset-less string in the server's
// timezone (#17). See `no-restricted-syntax` in eslint.config.mjs.
export function currentDate(): Date {
  return new Date();
}

export function fromEpochMs(ms: number): Date {
  return new Date(ms);
}

// For ISO 8601 strings that must carry a UTC offset, such as
// `ParsedEvent.start`. Throws on an offset-less string rather than
// guessing its timezone; use `parseZonedIso` for those.
export function parseOffsetIso(input: string): Date {
  return fromEpochMs(Temporal.Instant.from(input).epochMilliseconds);
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// The instant a wall-clock time denotes in a given IANA timezone — the
// reverse of `zonedDateTime`.
export function wallClockToDate(time: WallClock, timeZone: string): Date {
  const { year, month, day, hour, minute, second } = time;
  return fromEpochMs(
    Temporal.PlainDateTime.from({ year, month, day, hour, minute, second }).toZonedDateTime(
      timeZone,
    ).epochMilliseconds,
  );
}

// Formats a Date as an ISO 8601 string with the wall-clock time and UTC
// offset for a given IANA timezone (e.g. "2026-08-24T06:00:00+02:00").
export function formatZonedIso(date: Date, timeZone: string): string {
  return zonedDateTime(date, timeZone).toString({ smallestUnit: 'second', timeZoneName: 'never' });
}

// English weekday name ("Monday" … "Sunday") for a given instant in a
// given timezone. English regardless of the caller's locale — the LLM
// translates the label when replying, and one code path avoids `Intl`
// abbreviation quirks across locales.
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

// Temporal's dayOfWeek is ISO: 1 = Monday … 7 = Sunday, matching the Mon-Sun week used in the app.
export function weekdayNameOf(dayOfWeek: number): string {
  return WEEKDAY_NAMES[dayOfWeek - 1];
}

export function weekdayName(date: Date, timeZone: string): string {
  return weekdayNameOf(zonedDateTime(date, timeZone).dayOfWeek);
}

const OFFSET_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/;

// Parses an ISO 8601 date/time string into a Date, treating it as
// wall-clock time in `timeZone` when the string carries no UTC offset —
// the reverse of `formatZonedIso`.
export function parseZonedIso(input: string, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  try {
    if (OFFSET_SUFFIX_RE.test(input)) {
      return parseOffsetIso(input);
    }
    return fromEpochMs(
      Temporal.PlainDateTime.from(input).toZonedDateTime(timeZone).epochMilliseconds,
    );
  } catch {
    throw new Error(
      `invalid date-time: "${input}" (expected ISO 8601, e.g. "2026-08-26T19:00:00" or "2026-08-26T19:00:00+02:00")`,
    );
  }
}
