// Bun 1.4.0 ships the Temporal global natively (JSC, enabled by default —
// see https://github.com/oven-sh/bun/pull/32978). TypeScript 6.0 ships the
// matching ambient types in `lib.esnext.temporal.d.ts`, but doesn't include
// it by default even at `target: esnext` — it's opt-in via this directive
// rather than the `compilerOptions.lib` array, which would otherwise mean
// re-listing every lib already implied by `target: ES2023`.
/// <reference lib="esnext.temporal" />

// An invalid IANA timezone (e.g. a typo from a direct DB edit — there's no
// settings UI yet, see roadmap) makes Temporal throw a low-level
// `RangeError`. Callers should validate once, up front, with a clear
// message — not let it surface as an opaque failure, or worse, get
// silently swallowed by an unrelated try/catch (see calendar.service.ts's
// per-object parse error handling in `listEvents`).
export function assertValidTimeZone(timeZone: string): void {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch {
    throw new Error(`invalid IANA timezone: "${timeZone}"`);
  }
}

// Formats a Date as an ISO 8601 string with the wall-clock time and UTC
// offset for a given IANA timezone (e.g. "2026-08-24T06:00:00+02:00"), so
// the model never has to convert timezones itself — it only ever sees
// already-correct, unambiguous local times. See devlog day 12: the same
// principle already applied to "what is today" (inject it, don't ask the
// model to guess/compute it) extended to calendar event times.
export function formatZonedIso(date: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timeZone)
    .toString({ smallestUnit: 'second', timeZoneName: 'never' });
}

const OFFSET_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/;

// Parses an ISO 8601 date/time string into a Date, treating it as
// wall-clock time in `timeZone` when the string carries no UTC offset —
// the reverse of `formatZonedIso`. A model-supplied tool input is only
// *asked* (via the system prompt) to include an explicit offset, never
// enforced; a bare "2026-08-26T19:00:00" must not be handed to `new
// Date()`, which would interpret it as the server process's local
// timezone (UTC in this stack, per the Dockerfile), silently shifting
// the event by the user-vs-server offset. See issue #17.
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
