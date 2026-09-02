// Not included by default even at target: esnext — opt-in only.
/// <reference lib="esnext.temporal" />

// Temporal throws a low-level RangeError for an invalid IANA timezone;
// callers should validate once, up front, with a clear message instead.
export function assertValidTimeZone(timeZone: string): void {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch {
    throw new Error(`invalid IANA timezone: "${timeZone}"`);
  }
}

// Formats a Date as an ISO 8601 string with the wall-clock time and UTC
// offset for a given IANA timezone (e.g. "2026-08-24T06:00:00+02:00").
export function formatZonedIso(date: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timeZone)
    .toString({ smallestUnit: 'second', timeZoneName: 'never' });
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

export function weekdayName(date: Date, timeZone: string): string {
  // Temporal.dayOfWeek: 1 = Monday … 7 = Sunday (ISO), matches the
  // Mon-Sun week convention used throughout the app.
  const dow = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(
    timeZone,
  ).dayOfWeek;
  return WEEKDAY_NAMES[dow - 1];
}

// Mon-Sun bounds of the ISO week containing `date`, plus the following
// week — each returned as `YYYY-MM-DD (Weekday)` in the given timezone.
// Used to hand the LLM week arithmetic already-computed instead of
// having it derive "this week" / "next week" itself (issue #18).
export interface WeekBounds {
  thisWeekStart: string;
  thisWeekEnd: string;
  nextWeekStart: string;
  nextWeekEnd: string;
}

export function weekBoundsAround(date: Date, timeZone: string): WeekBounds {
  const zdt = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
  const monday = zdt.subtract({ days: zdt.dayOfWeek - 1 }).startOfDay();
  const label = (day: Temporal.ZonedDateTime): string => {
    const plain = day.toPlainDate().toString();
    const weekday = WEEKDAY_NAMES[day.dayOfWeek - 1];
    return `${plain} (${weekday})`;
  };
  return {
    thisWeekStart: label(monday),
    thisWeekEnd: label(monday.add({ days: 6 })),
    nextWeekStart: label(monday.add({ days: 7 })),
    nextWeekEnd: label(monday.add({ days: 13 })),
  };
}

const OFFSET_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/;

// Parses an ISO 8601 date/time string into a Date, treating it as
// wall-clock time in `timeZone` when the string carries no UTC offset —
// the reverse of `formatZonedIso`.
export function parseZonedIso(input: string, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  try {
    if (OFFSET_SUFFIX_RE.test(input)) {
      return new Date(Temporal.Instant.from(input).epochMilliseconds);
    }
    return new Date(Temporal.PlainDateTime.from(input).toZonedDateTime(timeZone).epochMilliseconds);
  } catch {
    throw new Error(
      `invalid date-time: "${input}" (expected ISO 8601, e.g. "2026-08-26T19:00:00" or "2026-08-26T19:00:00+02:00")`,
    );
  }
}
