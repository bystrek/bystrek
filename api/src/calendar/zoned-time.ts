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

  // The offset is derived by re-interpreting the timezone's wall-clock
  // reading as if it were UTC, then diffing against the real instant —
  // the standard technique for getting a timezone's offset at a specific
  // date (handles DST correctly) without a date library.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
