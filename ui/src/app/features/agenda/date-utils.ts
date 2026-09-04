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

export function hourFraction(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
