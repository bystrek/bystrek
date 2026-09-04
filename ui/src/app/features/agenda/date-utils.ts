// Not included by default even at target: esnext — opt-in only.
/// <reference lib="esnext.temporal" />

const DAY_ABBR = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const HEADER_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Monday of the week containing `date` — Sunday is day 0, so it maps to -6.
export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, diffToMonday));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// `iso` always carries an explicit UTC offset (see ical-event.ts) that
// already reflects the account's own configured timezone — read via
// Temporal.PlainDateTime, which takes the wall-clock fields as written and
// ignores the offset, rather than `new Date(iso)`, whose getters
// (getHours/getDate/...) reinterpret it in the *viewer's device* timezone.
// Those two can disagree, silently shifting an event onto the wrong hour
// or even the wrong day near midnight.
export function isSameDayAsIso(iso: string, date: Date): boolean {
  const event = Temporal.PlainDateTime.from(iso);
  return (
    event.year === date.getFullYear() &&
    event.month === date.getMonth() + 1 &&
    event.day === date.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function formatDayHeader(date: Date): string {
  return HEADER_FORMAT.format(date);
}

export function formatWeekHeader(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  return `Week of ${MONTH_DAY_FORMAT.format(weekStart)} - ${MONTH_DAY_FORMAT.format(weekEnd)}`;
}

export function weekdayAbbr(date: Date): string {
  return DAY_ABBR.format(date);
}

// Wall-clock hour, as written in `iso` — see isSameDayAsIso's note on why
// this doesn't go through `new Date(iso).getHours()`.
export function hourFractionFromIso(iso: string): number {
  const t = Temporal.PlainDateTime.from(iso);
  return t.hour + t.minute / 60;
}

export function formatTime(iso: string): string {
  return Temporal.PlainDateTime.from(iso).toPlainTime().toString({ smallestUnit: 'minute' });
}
