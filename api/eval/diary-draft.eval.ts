// Model-quality eval for drafting diary events: the real OpenAiLlmClient (the LLM_* settings
// in api/.env) and the real DiaryDraftService, with the user's time zone and categories
// replaced by fixtures. A case passes when the note splits into the expected events, each
// keeps every listed detail of the note, lands at the expected time and in the expected
// category. Two rules fail any case: a detail of the note is missing from its event's text,
// and a proposed category is an existing one in another form ("supplements").
//
// Not part of `bun test` or CI. Run from api/ (bun loads api/.env automatically):
//   bun run eval:diary-draft [--trials N]
// Another model: LLM_MODEL=<model> bun run eval:diary-draft

import { LLM_MODEL } from '../src/env';
import type { DiaryCategoriesService, DiaryCategory } from '../src/diary/diary-categories.service';
import type { DraftEvent } from '../src/diary/diary-draft.build';
import { DiaryDraftService, type DiaryDraftResponse } from '../src/diary/diary-draft.service';
import { localTimeToDate } from '../src/diary/diary-draft.time';
import { OpenAiLlmClient } from '../src/llm/openai.client';
import type { UsersService } from '../src/users/users.service';
import {
  groupBy,
  intFlag,
  median,
  passRate,
  printSummary,
  round,
  sum,
  TimedLlmClient,
} from './eval-support';

const USER_ID = 'eval-user';
const TIME_ZONE = 'Europe/Warsaw';

const category = (name: string, description: string | null = null): DiaryCategory => ({
  id: `cat-${name}`,
  name,
  description,
  parentId: null,
});
const CATEGORIES = [
  category('supplement', 'Supplements I take'),
  category('chores'),
  category('exercise', 'Workouts, walks and runs'),
  category('sleep'),
  category('digestion', 'Bowel movements and stomach'),
];

const users = { timeZone: () => Promise.resolve(TIME_ZONE) } as unknown as UsersService;
const categories = {
  list: () => Promise.resolve(CATEGORIES),
} as unknown as DiaryCategoriesService;

// Lowercase, without diacritics (ł mapped by hand: it doesn't decompose).
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// A detail is found when the event text has any of its spellings starting at a word boundary,
// compared without case or diacritics, so a Polish stem matches any inflection. A spelling
// that ends in a digit must end the number too: "5" never matches "50". Amounts carry their
// unit or scale ("5 g", "10 tys"), so a changed unit or a dropped thousand fails the case.
type Detail = string | string[];
const GRAMS_5 = ['5 g', '5g', '5 gram'];

interface ExpectedEvent {
  details: Detail[];
  // Local wall-clock bounds for occurredAt, inclusive. `at` is exact.
  at?: string;
  between?: [string, string];
  endsAt?: string;
  // An existing category's name, 'new' for any proposed one, or null for none.
  category?: string | null;
  // Words no proposed category may contain: people and places are details, not categories.
  notCategory?: string[];
}

interface EvalCase {
  id: string;
  text: string;
  // Local wall clock, in TIME_ZONE.
  capturedAt: string;
  // Empty: nothing to log.
  events: ExpectedEvent[];
}

const CASES: EvalCase[] = [
  {
    id: 'en-compound',
    text: 'did laundry and took 5g creatine',
    capturedAt: '2026-11-10T09:15',
    events: [
      { details: ['laundry'], category: 'chores' },
      { details: ['creatine', GRAMS_5], category: 'supplement' },
    ],
  },
  {
    id: 'pl-compound',
    text: 'zrobiłem pranie, wyniosłem śmieci i wziąłem magnez',
    capturedAt: '2026-11-10T19:40',
    events: [
      { details: ['pran'], category: 'chores' },
      { details: ['smiec'], category: 'chores' },
      { details: ['magnez'], category: 'supplement' },
    ],
  },
  {
    id: 'en-last-night',
    text: 'slept badly last night, woke up 3 times',
    capturedAt: '2026-11-10T07:30',
    events: [
      {
        details: [
          ['bad', 'poor'],
          ['3 times', 'three times'],
        ],
        between: ['2026-11-09T20:00', '2026-11-10T02:00'],
        category: 'sleep',
      },
    ],
  },
  {
    id: 'en-at-7',
    text: 'ran 5k at 7, legs felt heavy',
    capturedAt: '2026-11-10T09:00',
    events: [
      {
        details: [['5k', '5 k', '5 km', '5-k'], 'heavy'],
        at: '2026-11-10T07:00',
        category: 'exercise',
      },
    ],
  },
  {
    // At 06:30, "at 7" can only be yesterday evening.
    id: 'en-at-7-yesterday',
    text: 'took vitamin D at 7',
    capturedAt: '2026-11-10T06:30',
    events: [{ details: ['vitamin d'], at: '2026-11-09T19:00', category: 'supplement' }],
  },
  {
    id: 'en-yesterday',
    text: 'yesterday went to the gym with Tomek, chest day',
    capturedAt: '2026-11-10T10:00',
    events: [
      {
        details: ['tomek', 'chest'],
        between: ['2026-11-09T00:00', '2026-11-09T23:59'],
        category: 'exercise',
        notCategory: ['tomek'],
      },
    ],
  },
  {
    id: 'pl-wczoraj-wieczorem',
    text: 'wczoraj wieczorem pizza z Kasią w Nolio, za tłusta',
    capturedAt: '2026-11-10T12:00',
    events: [
      {
        details: ['pizz', 'kasi', 'nolio', 'tlust'],
        between: ['2026-11-09T17:00', '2026-11-09T23:59'],
        category: 'new',
        notCategory: ['kasi', 'nolio'],
      },
    ],
  },
  {
    // How it went stays with the event, even with a digestion category to tempt a split.
    id: 'en-feeling-stays',
    text: 'had a burger for lunch, way too salty',
    capturedAt: '2026-11-10T15:00',
    events: [
      {
        details: ['burger', 'salty'],
        between: ['2026-11-10T11:00', '2026-11-10T14:00'],
        category: 'new',
      },
    ],
  },
  {
    id: 'en-span',
    text: 'walked the dog from 6 to 7pm',
    capturedAt: '2026-11-10T21:00',
    events: [
      {
        details: ['dog'],
        at: '2026-11-10T18:00',
        endsAt: '2026-11-10T19:00',
        category: 'exercise',
      },
    ],
  },
  {
    id: 'en-health-detail',
    text: 'kinda meh poop, bit loose',
    capturedAt: '2026-11-10T08:10',
    events: [{ details: ['meh', 'loose'], category: 'digestion' }],
  },
  {
    id: 'pl-health-detail',
    text: 'kupa taka sobie, trochę luźna',
    capturedAt: '2026-11-10T08:10',
    events: [{ details: ['taka sobie', 'luzn'], category: 'digestion' }],
  },
  {
    id: 'en-typos',
    text: 'tok creatin 5g n did dishs',
    capturedAt: '2026-11-10T08:00',
    events: [
      { details: ['creatin', GRAMS_5], category: 'supplement' },
      { details: ['dish'], category: 'chores' },
    ],
  },
  {
    id: 'pl-typos',
    text: 'pszeszedlem sie 10tys krokow z psem',
    capturedAt: '2026-11-10T20:00',
    events: [
      {
        details: [
          ['10 tys', '10tys', '10 000', '10000', '10,000', '10.000', 'dziesiec tys'],
          ['pies', 'psem', 'psa'],
        ],
        category: 'exercise',
      },
    ],
  },
  {
    id: 'en-near-duplicate-category',
    text: 'took my supplements after breakfast',
    capturedAt: '2026-11-10T09:30',
    events: [{ details: ['breakfast'], category: 'supplement' }],
  },
  {
    id: 'pl-near-duplicate-category',
    text: 'łyknąłem suplementy po śniadaniu',
    capturedAt: '2026-11-10T09:30',
    events: [{ details: ['sniadani'], category: 'supplement' }],
  },
  {
    id: 'en-question',
    text: 'what did I eat yesterday?',
    capturedAt: '2026-11-10T12:00',
    events: [],
  },
];

const local = (wallClock: string) => localTimeToDate(wallClock, TIME_ZONE)!;
function hasDetail(text: string, detail: Detail): boolean {
  return [detail].flat().some((spelling) => {
    const escaped = fold(spelling).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const end = /\d$/.test(spelling) ? '(?!\\d)' : '';
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${end}`, 'u').test(fold(text));
  });
}
const singular = (name: string) => fold(name).trim().replace(/s$/, '');

function gradeEvent(expected: ExpectedEvent, event: DraftEvent): string | undefined {
  const missing = expected.details.filter((detail) => !hasDetail(event.text, detail));
  if (missing.length > 0) return `"${event.text}" lacks ${JSON.stringify(missing)}`;

  const occurredAt = event.occurredAt.getTime();
  if (expected.at && occurredAt !== local(expected.at).getTime()) {
    return `occurredAt ${event.occurredAt.toISOString()} != ${expected.at}`;
  }
  if (expected.between) {
    const [from, to] = expected.between.map((bound) => local(bound).getTime());
    if (occurredAt < from || occurredAt > to) {
      return `occurredAt ${event.occurredAt.toISOString()} outside ${expected.between.join('..')}`;
    }
  }
  if (expected.endsAt && event.endsAt?.getTime() !== local(expected.endsAt).getTime()) {
    return `endsAt ${event.endsAt?.toISOString() ?? null} != ${expected.endsAt}`;
  }

  const name = event.newCategory ?? CATEGORIES.find((c) => c.id === event.categoryId)?.name ?? null;
  if (event.newCategory && CATEGORIES.some((c) => singular(c.name) === singular(name!))) {
    return `proposed "${name}" duplicates an existing category`;
  }
  if (expected.notCategory?.some((word) => fold(name ?? '').includes(word))) {
    return `category "${name}" is a person or place`;
  }
  if (expected.category === undefined) return undefined;
  const actual = event.newCategory ? 'new' : name;
  if (actual !== expected.category) {
    return `category ${actual === 'new' ? `new "${name}"` : String(actual)} != ${expected.category}`;
  }
  return undefined;
}

// Each expected event is matched to the drafted event that carries its details.
function gradeResponse(evalCase: EvalCase, response: DiaryDraftResponse): string | undefined {
  if (evalCase.events.length === 0) {
    return response.kind === 'nothing' ? undefined : `kind ${response.kind} != nothing`;
  }
  if (response.kind !== 'draft') return `kind ${response.kind} != draft`;
  if (response.events.length !== evalCase.events.length) {
    return `${response.events.length} events != ${evalCase.events.length}`;
  }
  const unmatched = [...response.events];
  for (const expected of evalCase.events) {
    const index = unmatched.findIndex((event) => hasDetail(event.text, expected.details[0]));
    if (index === -1) return `no event mentions ${JSON.stringify(expected.details[0])}`;
    const reason = gradeEvent(expected, unmatched[index]);
    if (reason) return reason;
    unmatched.splice(index, 1);
  }
  return undefined;
}

interface Result {
  case: string;
  trial: number;
  pass: boolean;
  calls: number;
  modelMs: number;
  totalMs: number;
  text: string;
  reason: string;
}

async function main() {
  const trials = intFlag('--trials', 1);
  const model = new TimedLlmClient(new OpenAiLlmClient());
  const drafts = new DiaryDraftService(model, users, categories);
  const results: Result[] = [];

  console.log(`model=${LLM_MODEL} trials=${trials}`);

  for (let trial = 1; trial <= trials; trial++) {
    for (const evalCase of CASES) {
      model.reset();
      let reason: string | undefined;
      const started = performance.now();
      try {
        const response = await drafts.draft(USER_ID, evalCase.text, local(evalCase.capturedAt));
        reason = gradeResponse(evalCase, response);
        if (reason !== undefined) {
          reason += ` | reply=${model.outputs.at(-1)?.replace(/\s+/g, ' ') ?? '-'}`;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reason = `error: ${message}${model.errors.length > 0 ? ` (model: ${model.errors.join('; ')})` : ''}`;
      }
      results.push({
        case: evalCase.id,
        trial,
        pass: reason === undefined,
        calls: model.timings.length,
        modelMs: sum(model.timings),
        totalMs: performance.now() - started,
        text: evalCase.text,
        reason: reason ?? '',
      });
    }
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('\nFailures:');
    console.table(failures.map((r) => ({ case: r.case, text: r.text, reason: r.reason })));
  }

  console.log('\nBy case:');
  console.table(
    [...groupBy(results, (r) => r.case)].map(([id, group]) => ({
      case: id,
      pass: passRate(group),
      median_ms: round(median(group.map((r) => r.totalMs))),
    })),
  );

  printSummary(results);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
