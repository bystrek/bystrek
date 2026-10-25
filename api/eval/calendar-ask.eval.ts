/// <reference lib="esnext.temporal" />

// Model-quality eval for "ask your calendar": the real OllamaChatModel and the real
// CalendarAskService, with CalDAV replaced by in-memory events. Records latency and
// whether each answer matches the expected kind and content.
//
// Date mistakes depend on the weekday, so `--days N` replays every case as if today were
// each of the next N days (at 08:00), with fixtures and questions rebuilt for that day.
//
// Not part of `bun test` or CI. Run from api/ (bun loads api/.env automatically):
//   bun run eval:calendar-ask [--days N] [--trials N]

import type { AskResponse } from '../src/calendar/calendar-ask.answer';
import { CalendarAskService } from '../src/calendar/calendar-ask.service';
import type { CalendarService } from '../src/calendar/calendar.service';
import { buildEventIcs, parseEventIcs, type ParsedEvent } from '../src/calendar/ical-event';
import { parseZonedIso, weekdayNameOf, zonedDateTime } from '../src/calendar/zoned-time';
import type { ChatModel } from '../src/chat/chat.model';
import { OllamaChatModel } from '../src/chat/ollama.provider';
import { LLM_MODEL } from '../src/env';

const TZ = 'Europe/Warsaw';
const USER_ID = 'eval-user';
const SIMULATED_TIME = '08:00';
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const POLISH_WEEKDAYS_ACCUSATIVE = [
  'poniedziałek',
  'wtorek',
  'środę',
  'czwartek',
  'piątek',
  'sobotę',
  'niedzielę',
];

interface FixtureEvent {
  uid: string;
  summary: string;
  dayOffset: number;
  time: string;
  minutes: number;
}

// Nothing today, so at 08:00 the next event is always tomorrow's standup.
const FIXTURES: FixtureEvent[] = [
  { uid: 'standup', summary: 'Team standup', dayOffset: 1, time: '09:00', minutes: 30 },
  { uid: 'lunch', summary: 'Lunch with Ana', dayOffset: 1, time: '13:00', minutes: 60 },
  // Two events with the same title: a title search must pick the earlier one.
  { uid: 'yoga-1', summary: 'Yoga class', dayOffset: 2, time: '18:00', minutes: 60 },
  { uid: 'dentist', summary: 'Dentist', dayOffset: 3, time: '10:00', minutes: 60 },
  // Asked for by weekday name.
  { uid: 'board', summary: 'Board meeting', dayOffset: 4, time: '11:00', minutes: 60 },
  { uid: 'yoga-2', summary: 'Yoga class', dayOffset: 9, time: '18:00', minutes: 60 },
  { uid: 'sprint', summary: 'Sprint review', dayOffset: 10, time: '15:00', minutes: 60 },
  // Beyond two weeks, asked for by day of the month.
  { uid: 'conference', summary: 'Conference', dayOffset: 20, time: '09:00', minutes: 480 },
];

interface EvalCase {
  id: string;
  question: string;
  expectKind: AskResponse['kind'];
  // Substrings that must appear somewhere in the serialized answer.
  contains?: string[];
  // Substrings that must not appear in the serialized answer.
  absent?: string[];
}

// Questions that name dates are rebuilt for each simulated day.
function buildCases(today: Temporal.PlainDate): EvalCase[] {
  const weekday = (offset: number) => weekdayNameOf(today.add({ days: offset }).dayOfWeek);
  // Accusative, as after "w": "w czwartek", "w środę".
  const polishWeekday = (offset: number) =>
    POLISH_WEEKDAYS_ACCUSATIVE[today.add({ days: offset }).dayOfWeek - 1];
  const conference = today.add({ days: 20 });
  const nextWeekEvents = countNextWeek(today);
  return [
    {
      id: 'list-tomorrow',
      question: "What's on my calendar tomorrow?",
      expectKind: 'list',
      contains: ['Team standup', 'Lunch with Ana'],
      absent: ['Yoga class'],
    },
    {
      id: 'count-tomorrow',
      question: 'How many events do I have tomorrow?',
      expectKind: 'text',
      contains: ['You have 2 events'],
    },
    {
      id: 'find-dentist',
      question: 'When is my dentist appointment?',
      expectKind: 'event',
      contains: ['Dentist'],
    },
    {
      id: 'first-tomorrow',
      question: "What's my first meeting tomorrow?",
      expectKind: 'event',
      contains: ['Team standup'],
      absent: ['Lunch with Ana'],
    },
    {
      id: 'last-tomorrow',
      question: "What's my last event tomorrow?",
      expectKind: 'event',
      contains: ['Lunch with Ana'],
      absent: ['Team standup'],
    },
    {
      id: 'next-meeting',
      question: "What's my next meeting?",
      expectKind: 'event',
      contains: ['Team standup'],
    },
    {
      id: 'free-at-10-tomorrow',
      question: 'Am I free tomorrow at 10?',
      expectKind: 'availability',
      contains: ['You are free'],
      absent: ['Team standup', 'Lunch with Ana'],
    },
    {
      id: 'busy-at-915-tomorrow',
      question: 'Am I busy tomorrow at 9:15?',
      expectKind: 'availability',
      contains: ['Team standup'],
    },
    {
      id: 'sprint-review',
      question: 'When is my sprint review?',
      expectKind: 'event',
      contains: ['Sprint review'],
    },
    {
      id: 'cant-write',
      question: 'Delete my lunch tomorrow',
      expectKind: 'cant_do',
    },
    {
      id: 'find-repeated',
      question: 'When is my yoga class?',
      expectKind: 'event',
      contains: ['yoga-1'],
      absent: ['yoga-2'],
    },
    {
      id: 'find-missing',
      question: "When's my haircut?",
      expectKind: 'text',
      contains: ['No matching event'],
    },
    {
      id: 'list-weekday',
      question: `What do I have on ${weekday(4)}?`,
      expectKind: 'list',
      contains: ['Board meeting'],
      absent: ['Dentist'],
    },
    {
      id: 'list-explicit-date',
      question: `What's on the ${ordinal(conference.day)}?`,
      expectKind: 'list',
      contains: ['Conference'],
    },
    {
      id: 'list-month-date',
      question: `What's on ${conference.day} ${MONTHS[conference.month - 1]}?`,
      expectKind: 'list',
      contains: ['Conference'],
    },
    {
      id: 'day-after-tomorrow',
      question: 'What do I have the day after tomorrow?',
      expectKind: 'list',
      contains: ['Yoga class'],
      absent: ['Team standup', 'Dentist'],
    },
    {
      id: 'list-range',
      question: `What's on from tomorrow until ${weekday(3)}?`,
      expectKind: 'list',
      contains: ['Team standup', 'Yoga class', 'Dentist'],
      absent: ['Board meeting'],
    },
    {
      id: 'count-next-week',
      question: 'How many events do I have next week?',
      expectKind: 'text',
      contains: [
        nextWeekEvents === 0
          ? 'no events'
          : `You have ${nextWeekEvents} event${nextWeekEvents === 1 ? '' : 's'}`,
      ],
    },
    {
      id: 'pl-list-tomorrow',
      question: 'Co mam jutro w kalendarzu?',
      expectKind: 'list',
      contains: ['Team standup', 'Lunch with Ana'],
      absent: ['Yoga class'],
    },
    {
      id: 'pl-find',
      question: 'Kiedy jest sprint review?',
      expectKind: 'event',
      contains: ['Sprint review'],
    },
    // Held out: no prompt example or glossary entry covers these Polish phrasings.
    {
      id: 'pl-day-after-tomorrow',
      question: 'Co mam pojutrze?',
      expectKind: 'list',
      contains: ['Yoga class'],
      absent: ['Team standup', 'Dentist'],
    },
    {
      id: 'pl-count-next-week',
      question: 'Ile mam wydarzeń w przyszłym tygodniu?',
      expectKind: 'text',
      contains: [
        nextWeekEvents === 0
          ? 'no events'
          : `You have ${nextWeekEvents} event${nextWeekEvents === 1 ? '' : 's'}`,
      ],
    },
    {
      id: 'pl-in-three-days',
      question: 'Co mam za trzy dni?',
      expectKind: 'list',
      contains: ['Dentist'],
      absent: ['Yoga class', 'Board meeting'],
    },
    {
      id: 'pl-free-weekday-afternoon',
      question: `Czy jestem wolny w ${polishWeekday(4)} po południu?`,
      expectKind: 'availability',
      contains: ['You are free'],
      absent: ['Board meeting'],
    },
  ];
}

// Fixtures in the Mon-Sun week after the one containing `today`.
function countNextWeek(today: Temporal.PlainDate): number {
  const start = today.subtract({ days: today.dayOfWeek - 1 }).add({ days: 7 });
  const end = start.add({ days: 7 });
  return FIXTURES.filter((fixture) => {
    const date = today.add({ days: fixture.dayOffset });
    return (
      Temporal.PlainDate.compare(date, start) >= 0 && Temporal.PlainDate.compare(date, end) < 0
    );
  }).length;
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${suffix}`;
}

// Goes through the same ICS parsing the CalDAV path uses, so ParsedEvent matches production.
// Calendar-day arithmetic in TZ, so a DST change before the target day can't shift it.
function buildCalendar(today: Temporal.PlainDate): ParsedEvent[] {
  return FIXTURES.map((fixture) => {
    const date = today.add({ days: fixture.dayOffset }).toString();
    const start = parseZonedIso(`${date}T${fixture.time}`, TZ);
    const end = new Date(start.getTime() + fixture.minutes * 60_000);
    const ics = buildEventIcs(fixture.uid, { summary: fixture.summary, start, end });
    return parseEventIcs(ics, TZ);
  });
}

function fakeCalendar(events: () => ParsedEvent[]): CalendarService {
  return {
    listEvents: async (_userId: string, range: { start: Date; end: Date }) =>
      events().filter(
        (event) =>
          Date.parse(event.start) < range.end.getTime() &&
          Date.parse(event.end) > range.start.getTime(),
      ),
  } as unknown as CalendarService;
}

// Records each completion's latency and raw reply.
class TimedChatModel implements ChatModel {
  readonly timings: number[] = [];
  // CalendarAskService replaces model errors with a generic message, so keep the originals.
  readonly errors: string[] = [];
  readonly outputs: string[] = [];

  constructor(private readonly inner: ChatModel) {}

  reset(): void {
    this.timings.length = 0;
    this.errors.length = 0;
    this.outputs.length = 0;
  }

  async generate(system: string, user: string, format: Record<string, unknown>): Promise<string> {
    const started = performance.now();
    try {
      const output = await this.inner.generate(system, user, format);
      this.outputs.push(output);
      return output;
    } catch (err) {
      this.errors.push(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      this.timings.push(performance.now() - started);
    }
  }
}

function gradeAnswer(evalCase: EvalCase, response: AskResponse): string | undefined {
  if (response.kind !== evalCase.expectKind) {
    return `kind ${response.kind} != ${evalCase.expectKind}`;
  }
  const haystack = JSON.stringify(response);
  const missing = (evalCase.contains ?? []).filter((text) => !haystack.includes(text));
  if (missing.length > 0) return `missing: ${missing.join(', ')}`;
  const unexpected = (evalCase.absent ?? []).filter((text) => haystack.includes(text));
  if (unexpected.length > 0) return `unexpected: ${unexpected.join(', ')}`;
  return undefined;
}

interface Result {
  case: string;
  day: string;
  trial: number;
  pass: boolean;
  calls: number;
  modelMs: number;
  totalMs: number;
  question: string;
  reason: string;
}

function intFlag(name: string, fallback: number): number {
  const flag = process.argv.indexOf(name);
  if (flag === -1) return fallback;
  const value = Number(process.argv[flag + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (ms: number) => Math.round(ms);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function passRate(results: Result[]): string {
  const passed = results.filter((r) => r.pass).length;
  return `${passed}/${results.length}`;
}

function groupBy(results: Result[], key: (r: Result) => string): Map<string, Result[]> {
  const groups = new Map<string, Result[]>();
  for (const result of results) {
    const group = groups.get(key(result)) ?? [];
    group.push(result);
    groups.set(key(result), group);
  }
  return groups;
}

async function main() {
  const days = intFlag('--days', 1);
  const trials = intFlag('--trials', 1);
  const model = new TimedChatModel(new OllamaChatModel());
  let events: ParsedEvent[] = [];
  const ask = new CalendarAskService(
    model,
    fakeCalendar(() => events),
  );
  const results: Result[] = [];
  const realToday = zonedDateTime(new Date(), TZ).toPlainDate();

  console.log(`model=${LLM_MODEL} tz=${TZ} days=${days} trials=${trials}`);

  for (let offset = 0; offset < days; offset++) {
    const today = realToday.add({ days: offset });
    const now = new Date(
      today.toZonedDateTime({ timeZone: TZ, plainTime: SIMULATED_TIME }).epochMilliseconds,
    );
    const day = `${weekdayNameOf(today.dayOfWeek).slice(0, 3)} ${today.toString()}`;
    events = buildCalendar(today);
    const cases = buildCases(today);

    for (let trial = 1; trial <= trials; trial++) {
      for (const evalCase of cases) {
        model.reset();
        let reason: string | undefined;
        const started = performance.now();
        try {
          const response = await ask.ask(USER_ID, TZ, evalCase.question, now);
          reason = gradeAnswer(evalCase, response);
          if (reason !== undefined) {
            const text = 'text' in response ? ` -> "${response.text}"` : '';
            reason += `${text} | query=${model.outputs.at(-1)?.replace(/\s+/g, ' ') ?? '-'}`;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          reason = `error: ${message}${model.errors.length > 0 ? ` (model: ${model.errors.join('; ')})` : ''}`;
        }
        results.push({
          case: evalCase.id,
          day,
          trial,
          pass: reason === undefined,
          calls: model.timings.length,
          modelMs: sum(model.timings),
          totalMs: performance.now() - started,
          question: evalCase.question,
          reason: reason ?? '',
        });
      }
    }
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('\nFailures:');
    console.table(
      failures.map((r) => ({ day: r.day, case: r.case, question: r.question, reason: r.reason })),
    );
  }

  console.log('\nBy case:');
  console.table(
    [...groupBy(results, (r) => r.case)].map(([id, group]) => ({
      case: id,
      pass: passRate(group),
      median_ms: round(median(group.map((r) => r.totalMs))),
    })),
  );

  if (days > 1) {
    console.log('\nBy simulated day:');
    console.table(
      [...groupBy(results, (r) => r.day)].map(([day, group]) => ({ day, pass: passRate(group) })),
    );
  }

  // The first call after a model load pays for the uncached system prompt; keep it out of latency.
  const warm = results.slice(1);
  const passed = results.filter((r) => r.pass).length;
  console.log(
    `\naccuracy: ${passed}/${results.length} (${((100 * passed) / results.length).toFixed(1)}%)`,
  );
  if (warm.length > 0) {
    const totals = warm.map((r) => r.totalMs);
    console.log(
      `latency ms (warm): total median=${round(median(totals))} mean=${round(mean(totals))} ` +
        `p90=${round(percentile(totals, 90))} max=${round(Math.max(...totals))} | ` +
        `model calls per question=${(sum(warm.map((r) => r.calls)) / warm.length).toFixed(1)} ` +
        `model ms mean=${round(mean(warm.map((r) => r.modelMs)))}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
