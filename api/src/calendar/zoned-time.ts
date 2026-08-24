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

const OFFSET_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/;

// Parses an ISO 8601 date/time string into a Date, treating it as
// wall-clock time in `timeZone` when the string carries no UTC offset —
// the reverse of `formatZonedIso`.
export function parseZonedIso(input: string, timeZone: string): Date {
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
