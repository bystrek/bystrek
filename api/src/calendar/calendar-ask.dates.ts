/// <reference lib="esnext.temporal" />
import { weekdayNameOf, zonedDateTime } from './zoned-time';

// Date words the model sends instead of dates. The model never sees today's date;
// resolveWhen turns these words into a window in the user's timezone.
export interface WhenWords {
  day?: unknown;
  until?: unknown;
  time?: unknown;
  range?: unknown;
}

// Epoch ms, end exclusive.
export interface TimeWindow {
  start: number;
  end: number;
}

// "+N" offsets beyond a year are rejected, matching the query range cap.
const MAX_DAYS_AHEAD = 366;
const HOUR_MS = 60 * 60 * 1000;

// Maps, not object literals: a model word like "constructor" must not hit Object.prototype.
const PERIODS = new Map<string, [string, string | undefined]>([
  ['morning', ['06:00', '12:00']],
  ['afternoon', ['12:00', '18:00']],
  // Ends at the next midnight.
  ['evening', ['18:00', undefined]],
]);

// Without a day the window is today. `until` makes it span several whole days; otherwise
// `time` narrows the day to a period or to one hour from a clock time. `range` replaces
// all of them with this or next Mon-Sun week. Anything unrecognised yields undefined.
export function resolveWhen(words: WhenWords, now: Date, timeZone: string): TimeWindow | undefined {
  const today = zonedDateTime(now, timeZone).toPlainDate();
  const at = (date: Temporal.PlainDate, time = '00:00'): number =>
    date.toZonedDateTime({ timeZone, plainTime: time }).epochMilliseconds;

  if (words.range !== undefined) {
    if (words.range !== 'this_week' && words.range !== 'next_week') return undefined;
    const monday = today
      .subtract({ days: today.dayOfWeek - 1 })
      .add({ days: words.range === 'next_week' ? 7 : 0 });
    return { start: at(monday), end: at(monday.add({ days: 7 })) };
  }

  const first = words.day === undefined ? today : resolveDay(words.day, today, today);
  if (!first) return undefined;

  if (words.until !== undefined) {
    const last = resolveDay(words.until, today, first);
    if (!last || Temporal.PlainDate.compare(last, first) < 0) return undefined;
    return { start: at(first), end: at(last.add({ days: 1 })) };
  }

  if (words.time === undefined) return { start: at(first), end: at(first.add({ days: 1 })) };
  if (typeof words.time !== 'string') return undefined;
  const period = PERIODS.get(words.time);
  if (period) {
    const [from, to] = period;
    return { start: at(first, from), end: to ? at(first, to) : at(first.add({ days: 1 })) };
  }
  const clock = parseClock(words.time);
  if (!clock) return undefined;
  const start = at(first, clock);
  return { start, end: start + HOUR_MS };
}

// "15:00", "9:15", a bare hour "10", or 12-hour "3pm" / "9:30 am", as "HH:MM".
function parseClock(text: string): string | undefined {
  const match = /^(\d{1,2})(?::(\d{2}))? ?(am|pm|h)?$/.exec(text.trim().toLowerCase());
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (meridiem === 'am' || meridiem === 'pm') {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// "today", "tomorrow", "day after tomorrow" and "+N" count from today. A weekday, a day of
// the month ("14") or a day and month ("14 nov") is its next occurrence on or after
// `notBefore`; a date with a year ("14 nov 2027") is exactly that date.
function resolveDay(
  value: unknown,
  today: Temporal.PlainDate,
  notBefore: Temporal.PlainDate,
): Temporal.PlainDate | undefined {
  if (typeof value !== 'string') return undefined;
  const word = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
  // Models write this phrase out instead of "+2", or copy the Polish word from the question.
  if (/^(?:the )?day after tomorrow$/.test(word)) return today.add({ days: 2 });
  const polish = POLISH_DAYS.get(word);
  if (polish !== undefined) return today.add({ days: polish });

  const offset = /^\+(\d{1,3})$/.exec(word);
  if (offset) {
    const days = Number(offset[1]);
    return days <= MAX_DAYS_AHEAD ? today.add({ days }) : undefined;
  }

  const dayOfMonth = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(word);
  if (dayOfMonth) return nextDayOfMonth(Number(dayOfMonth[1]), notBefore);

  const dated = parseNamedDate(word);
  if (dated) {
    // A year the question names is kept as asked, even in the past.
    return dated.year === undefined
      ? nextMonthDay(dated.month, dated.day, notBefore)
      : exactDate(dated.year, dated.month, dated.day);
  }

  const named = closestWord(word, DAY_WORDS);
  if (named === 'today') return today;
  if (named === 'tomorrow') return today.add({ days: 1 });
  if (named !== undefined) {
    const dayOfWeek = DAY_WORDS.indexOf(named) - 1;
    return notBefore.add({ days: (dayOfWeek - notBefore.dayOfWeek + 7) % 7 });
  }
  return undefined;
}

// Exact matches only: fuzzy matching would confuse "jutro" and "pojutrze".
const POLISH_DAYS = new Map([
  ['dziś', 0],
  ['dzis', 0],
  ['dzisiaj', 0],
  ['jutro', 1],
  ['pojutrze', 2],
]);

// Index - 1 is the ISO day of week for the weekday names.
const DAY_WORDS = [
  'today',
  'tomorrow',
  ...Array.from({ length: 7 }, (_, index) => weekdayNameOf(index + 1).toLowerCase()),
];

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

interface NamedDate {
  day: number;
  month: number;
  year?: number;
}

// "14 nov", "nov 14th", either with an optional year ("14 nov 2027"), ISO "2027-11-14", or
// a numeric pair when only one reading is a valid month: models write both "11-14" and
// "14-11", so "05-11" is ambiguous and rejected.
function parseNamedDate(word: string): NamedDate | undefined {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(word);
  if (iso) return withYear(Number(iso[3]), Number(iso[2]), iso[1]);

  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)\.?(?:,? (\d{4}))?$/.exec(word);
  const monthFirst = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(word);
  const [dayText, monthText, yearText] = dayFirst
    ? [dayFirst[1], dayFirst[2], dayFirst[3]]
    : monthFirst
      ? [monthFirst[2], monthFirst[1], monthFirst[3]]
      : [];
  if (dayText && monthText) {
    const month = closestWord(monthText, MONTH_NAMES);
    return month === undefined
      ? undefined
      : withYear(Number(dayText), MONTH_NAMES.indexOf(month) + 1, yearText);
  }

  const pair = /^(\d{1,2})[-./](\d{1,2})$/.exec(word);
  if (!pair) return undefined;
  const [first, second] = [Number(pair[1]), Number(pair[2])];
  if (first <= 12 && second > 12) return { month: first, day: second };
  if (second <= 12 && first > 12) return { month: second, day: first };
  return undefined;
}

// Small models abbreviate and misspell ("thur", "tomor", "tommorow"). A word matches a
// candidate it starts (3+ letters) or is within two edits of (5+ letters); anything that
// matches more than one candidate equally well is rejected rather than guessed.
function closestWord(word: string, candidates: string[]): string | undefined {
  if (candidates.includes(word)) return word;
  if (word.length >= 3) {
    const prefixed = candidates.filter((candidate) => candidate.startsWith(word));
    if (prefixed.length === 1) return prefixed[0];
    if (prefixed.length > 1) return undefined;
  }
  if (word.length < 5) return undefined;
  const scored = candidates
    .map((candidate) => ({ candidate, distance: editDistance(word, candidate) }))
    .filter(({ distance }) => distance <= 2)
    .sort((a, b) => a.distance - b.distance);
  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[1].distance === scored[0].distance) return undefined;
  return scored[0].candidate;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

// 31 skips the shorter months; a year of months always contains every valid day.
function nextDayOfMonth(day: number, from: Temporal.PlainDate): Temporal.PlainDate | undefined {
  for (let offset = 0; offset < 12; offset++) {
    const month = from.with({ day: 1 }).add({ months: offset });
    const date = exactDate(month.year, month.month, day);
    if (date && Temporal.PlainDate.compare(date, from) >= 0) return date;
  }
  return undefined;
}

// The first occurrence on or after `from`. Impossible dates (Feb 30) yield undefined.
function nextMonthDay(
  month: number,
  day: number,
  from: Temporal.PlainDate,
): Temporal.PlainDate | undefined {
  // Feb 29 can be up to 8 years away (2096 to 2104); nothing else is more than one.
  for (let offset = 0; offset <= 8; offset++) {
    const date = exactDate(from.year + offset, month, day);
    if (date && Temporal.PlainDate.compare(date, from) >= 0) return date;
  }
  return undefined;
}

// Years outside this range are model noise, not dates anyone asks about.
function withYear(day: number, month: number, yearText: string | undefined): NamedDate | undefined {
  if (yearText === undefined) return { day, month };
  const year = Number(yearText);
  return year >= 1900 && year <= 2999 ? { day, month, year } : undefined;
}

function exactDate(year: number, month: number, day: number): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
  } catch {
    return undefined;
  }
}
