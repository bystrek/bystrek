// Day keys ("YYYY-MM-DD") and wall-clock helpers for the agenda. The account
// timezone decides which day an instant falls on; the browser timezone never does.

// The account's calendar day (YYYY-MM-DD) for an instant.
export function zonedDateKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

// Day arithmetic on keys runs in local time, so only the key format matters here.
function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// Wall-clock bounds without an offset: the API reads these in the user's timezone.
export function dayBounds(key: string): { start: string; end: string } {
  return { start: `${key}T00:00:00`, end: `${shiftDay(key, 1)}T00:00:00` };
}

// en-GB gives the day-first order used in the agenda design ("FRI 24 OCT"),
// regardless of the browser's default locale.
export function formatDayLabel(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parseDateKey(key))
    .toUpperCase();
}

// The API formats times in the account timezone, so the clock digits are read directly.
export function clockTime(iso: string): string {
  return iso.slice(11, 16);
}
