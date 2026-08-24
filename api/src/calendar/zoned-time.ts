// An invalid IANA timezone (e.g. a typo from a direct DB edit — there's no
// settings UI yet, see roadmap) makes `Intl.DateTimeFormat` throw a
// low-level `RangeError`. Callers should validate once, up front, with a
// clear message — not let it surface as an opaque failure, or worse, get
// silently swallowed by an unrelated try/catch (see calendar.service.ts's
// per-object parse error handling in `listEvents`).
export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
  } catch {
    throw new Error(`invalid IANA timezone: "${timeZone}"`);
  }
}

// One Intl.DateTimeFormat per timezone, reused across calls — construction
// has real overhead (locale/calendar data), and `parseEventIcs` calls this
// twice per event (start + end).
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let dtf = formatterCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, dtf);
  }
  return dtf;
}

// The offset is derived by re-interpreting the timezone's wall-clock
// reading (at the given instant) as if it were UTC, then diffing against
// the real instant — the standard technique for getting a timezone's
// offset at a specific date (handles DST correctly) without a date
// library.
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Formats a Date as an ISO 8601 string with the wall-clock time and UTC
// offset for a given IANA timezone (e.g. "2026-08-24T06:00:00+02:00"), so
// the model never has to convert timezones itself — it only ever sees
// already-correct, unambiguous local times. See devlog day 12: the same
// principle already applied to "what is today" (inject it, don't ask the
// model to guess/compute it) extended to calendar event times.
export function formatZonedIso(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = formatOffset(zoneOffsetMinutes(date, timeZone));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

const OFFSET_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/;
const BARE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Parses an ISO 8601 date/time string into a Date, treating it as
// wall-clock time in `timeZone` when the string carries no UTC offset —
// the reverse of `formatZonedIso`. A model-supplied tool input is only
// *asked* (via the system prompt) to include an explicit offset, never
// enforced; a bare "2026-08-26T19:00:00" must not be handed to `new
// Date()`, which would interpret it as the server process's local
// timezone (UTC in this stack, per the Dockerfile), silently shifting
// the event by the user-vs-server offset. See issue #17.
export function parseZonedIso(input: string, timeZone: string): Date {
  if (OFFSET_SUFFIX_RE.test(input)) {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`invalid date-time: "${input}"`);
    }
    return parsed;
  }

  const match = BARE_ISO_RE.exec(input);
  if (!match) {
    throw new Error(
      `invalid date-time: "${input}" (expected ISO 8601, e.g. "2026-08-26T19:00:00" or "2026-08-26T19:00:00+02:00")`,
    );
  }
  const [, year, month, day, hour, minute, second] = match;
  const asUtcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    ),
  );
  const offsetMinutes = zoneOffsetMinutes(asUtcGuess, timeZone);
  return new Date(asUtcGuess.getTime() - offsetMinutes * 60_000);
}
