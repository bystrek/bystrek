/// <reference lib="esnext.temporal" />
import { formatZonedIso, weekdayNameOf, zonedDateTime } from './zoned-time';

// Days listed in the user message so the model can map weekday names to dates.
export const DATES_AHEAD = 14;

export interface WeekBounds {
  thisWeekStart: string;
  thisWeekEnd: string;
  nextWeekStart: string;
  nextWeekEnd: string;
}

interface DayEntry {
  weekday: string;
  date: string;
  relative?: 'today' | 'tomorrow';
}

const MAX_REFERENCED_DATES = 3;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function nowLine(now: Date, timeZone: string): string {
  const today = zonedDateTime(now, timeZone);
  return `Now: ${shortWeekday(today.dayOfWeek)} ${formatZonedIso(now, timeZone).slice(0, 16).replace('T', ' ')}`;
}

// Prompt lines describing "now" and the surrounding dates in `timeZone`, so the
// model never does date arithmetic itself. `referenced` are explicit dates outside
// the window that the discovery call found; they are appended to the Dates line.
export function describeDates(now: Date, timeZone: string, referenced: string[] = []): string[] {
  const today = zonedDateTime(now, timeZone);
  const days = upcomingDays(today.toPlainDate(), DATES_AHEAD);
  const week = weekBoundsAround(now, timeZone);
  const listed = new Set(days.map((day) => day.date));
  const extra = [...new Set(referenced)]
    .filter((date) => !listed.has(date))
    .sort()
    .map((date) =>
      formatDayEntry({ weekday: shortWeekday(Temporal.PlainDate.from(date).dayOfWeek), date }),
    );
  return [
    nowLine(now, timeZone),
    `Dates: ${[...days.map(formatDayEntry), ...extra].join(', ')}`,
    `Weekdays: ${firstOfEachWeekday(days).join(', ')}`,
    `This week: ${week.thisWeekStart} to ${week.thisWeekEnd}. Next week: ${week.nextWeekStart} to ${week.nextWeekEnd}.`,
  ];
}

// Keeps only well-formed, real calendar dates from the discovery reply. Malformed
// output yields no dates rather than an error, since the main query can still run.
export function parseReferencedDates(content: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return [];
  }
  const dates = (value as { dates?: unknown } | null)?.dates;
  if (!Array.isArray(dates)) return [];

  const valid = new Set<string>();
  for (const item of dates) {
    if (typeof item !== 'string' || !ISO_DATE_PATTERN.test(item)) continue;
    try {
      valid.add(Temporal.PlainDate.from(item).toString());
    } catch {
      // Well-formed but impossible date, e.g. Feb 30.
    }
  }
  return [...valid].slice(0, MAX_REFERENCED_DATES);
}

// Mon-Sun bounds of the ISO week containing `date`, plus the following week,
// each formatted as `YYYY-MM-DD (Weekday)` in `timeZone`.
export function weekBoundsAround(date: Date, timeZone: string): WeekBounds {
  const current = zonedDateTime(date, timeZone);
  const monday = current.subtract({ days: current.dayOfWeek - 1 }).startOfDay();
  const label = (day: Temporal.ZonedDateTime): string =>
    `${day.toPlainDate().toString()} (${weekdayNameOf(day.dayOfWeek)})`;
  return {
    thisWeekStart: label(monday),
    thisWeekEnd: label(monday.add({ days: 6 })),
    nextWeekStart: label(monday.add({ days: 7 })),
    nextWeekEnd: label(monday.add({ days: 13 })),
  };
}

function upcomingDays(from: Temporal.PlainDate, count: number): DayEntry[] {
  const relatives = ['today', 'tomorrow'] as const;
  return Array.from({ length: count }, (_, offset) => {
    const day = from.add({ days: offset });
    return {
      weekday: shortWeekday(day.dayOfWeek),
      date: day.toString(),
      relative: relatives[offset],
    };
  });
}

function shortWeekday(dayOfWeek: number): string {
  return weekdayNameOf(dayOfWeek).slice(0, 3);
}

function formatDayEntry(day: DayEntry): string {
  return `${day.weekday} ${day.date}${day.relative ? ` (${day.relative})` : ''}`;
}

// The next occurrence of each weekday, so a bare weekday name maps to one date.
function firstOfEachWeekday(days: DayEntry[]): string[] {
  const firsts = new Map<string, string>();
  for (const day of days) {
    if (!firsts.has(day.weekday)) firsts.set(day.weekday, day.date);
  }
  return [...firsts].map(([weekday, date]) => `${weekday}=${date}`);
}
