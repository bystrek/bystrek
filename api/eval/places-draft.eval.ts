// Model-quality eval for drafting a place: the real OpenAiLlmClient (the LLM_* settings in
// api/.env) and the real PlacesDraftService, with the geocoder and the saved places replaced
// by in-memory fixtures. Records latency and whether each draft has the expected outcome and
// fields. Two rules fail any case: the model's reply has a key beyond the draft's fields
// (coordinates included), or its address has a word the prompt doesn't.
//
// Not part of `bun test` or CI. Run from api/ (bun loads api/.env automatically):
//   bun run eval:places-draft [--trials N]

import { LLM_MODEL } from '../src/env';
import { OsmType, type GeocodedLocation, type Geocoder } from '../src/geo/geocoder';
import { OpenAiLlmClient } from '../src/llm/openai.client';
import { PlaceCategory } from '../src/places/place-category';
import {
  MissingItem,
  PlacesDraftService,
  type PlaceDraftResponse,
} from '../src/places/places-draft.service';
import type { Place, PlacesService } from '../src/places/places.service';
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
const DRAFT_KEYS = new Set(['kind', 'name', 'category', 'address', 'notes', 'url']);

// Lowercase, without diacritics (ł mapped by hand: it doesn't decompose), split into words.
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
const fold = (text: string) => words(text).join(' ');

function location(osmId: number, displayAddress: string): GeocodedLocation {
  return { osmType: OsmType.Node, osmId, displayAddress, lat: 50.06, lng: 19.94 };
}

// The geocoder knows a few Kraków addresses, keyed by words its query must contain. Both a
// "name, address" query and the address-only fallback match, as long as the address is there.
const GEOCODED: { match: string; results: GeocodedLocation[] }[] = [
  { match: 'tomasza 17', results: [location(1, 'Café Camelot, Świętego Tomasza 17, Kraków')] },
  { match: '3 maja 1', results: [location(2, 'Muzeum Narodowe, aleja 3 Maja 1, Kraków')] },
  { match: 'felicjanska 4', results: [location(3, 'Massolit Books, Felicjańska 4, Kraków')] },
  { match: 'na groblach 9', results: [location(4, 'Pod Wawelem, plac Na Groblach 9, Kraków')] },
  { match: 'szczepanski 3', results: [location(5, 'Bunkier Sztuki, plac Szczepański 3a')] },
  {
    match: 'meiselsa 20',
    results: [location(6, 'Meiselsa 20, Kazimierz, Kraków'), location(7, 'Meiselsa 20, Bochnia')],
  },
  { match: 'rynek glowny 1', results: [location(8, 'Sukiennice, Rynek Główny 1, Kraków')] },
];

// Sukiennice is already on the list.
const SAVED = new Map<number, Place>([
  [8, { id: 'place-8', name: 'Sukiennice', createdBy: { id: 'ana', name: 'Ana' } } as Place],
]);

const geocoder: Geocoder = {
  search: (query) =>
    Promise.resolve(GEOCODED.find((entry) => fold(query).includes(entry.match))?.results ?? []),
  lookup: () => Promise.resolve(null),
};
const places = {
  findByOsm: (_userId: string, _type: OsmType, osmId: number) => Promise.resolve(SAVED.get(osmId)),
} as unknown as PlacesService;

interface EvalCase {
  id: string;
  text: string;
  expectKind: PlaceDraftResponse['kind'];
  // needs_input only: exactly these items.
  missing?: MissingItem[];
  category?: PlaceCategory;
  // Words each field must contain, compared without case or diacritics.
  name?: string;
  address?: string;
  notes?: string;
  url?: string;
}

const CASES: EvalCase[] = [
  {
    id: 'en-complete',
    text: 'Café Camelot, Świętego Tomasza 17, Kraków — great cheesecake',
    expectKind: 'ready',
    name: 'camelot',
    category: PlaceCategory.Cafe,
    address: 'tomasza 17',
    notes: 'cheesecake',
  },
  {
    id: 'pl-complete',
    text: 'Muzeum Narodowe, al. 3 Maja 1, Kraków. Koniecznie zobaczyć Galerię Sztuki Polskiej',
    expectKind: 'ready',
    name: 'muzeum narodowe',
    category: PlaceCategory.Museum,
    address: '3 maja 1',
    notes: 'galerie sztuki',
  },
  {
    id: 'en-with-url',
    text: 'Massolit Books, Felicjańska 4, Kraków https://massolit.com huge English bookshop',
    expectKind: 'ready',
    name: 'massolit',
    category: PlaceCategory.Shop,
    address: 'felicjanska 4',
    url: 'https://massolit.com',
  },
  {
    id: 'en-missing-address',
    text: 'A ramen place called Hachi that we should try',
    expectKind: 'needs_input',
    missing: [MissingItem.Address],
    name: 'hachi',
    category: PlaceCategory.Restaurant,
  },
  {
    id: 'pl-missing-address',
    text: 'Fajna pizzeria Nolio, polecana przez Kasię',
    expectKind: 'needs_input',
    missing: [MissingItem.Address],
    name: 'nolio',
    category: PlaceCategory.Restaurant,
  },
  {
    id: 'name-only',
    text: 'Bunkier Sztuki',
    expectKind: 'needs_input',
    missing: [MissingItem.Address],
    name: 'bunkier sztuki',
  },
  {
    // A famous place tempts the model to supply the address it knows.
    id: 'name-only-landmark',
    text: 'Wawel Castle, a must see',
    expectKind: 'needs_input',
    missing: [MissingItem.Address],
    name: 'wawel',
  },
  {
    id: 'address-only',
    text: 'Floriańska 3, Kraków',
    expectKind: 'needs_input',
    missing: [MissingItem.Name],
    address: 'florianska 3',
  },
  // The same prompts before and after the user adds the missing part.
  {
    id: 'refine-before',
    text: 'Pod Wawelem restaurant, huge portions',
    expectKind: 'needs_input',
    missing: [MissingItem.Address],
    name: 'pod wawelem',
  },
  {
    id: 'refine-after',
    text: 'Pod Wawelem restaurant, plac Na Groblach 9, Kraków, huge portions',
    expectKind: 'ready',
    name: 'pod wawelem',
    category: PlaceCategory.Restaurant,
    address: 'na groblach 9',
    notes: 'portions',
  },
  {
    id: 'refine-name-only-after',
    text: 'Bunkier Sztuki, plac Szczepański 3a, Kraków',
    expectKind: 'ready',
    name: 'bunkier sztuki',
    address: 'szczepanski 3a',
  },
  {
    id: 'address-not-found',
    text: 'Kawiarnia Zielona, Nieistniejąca 99, Kraków',
    expectKind: 'needs_input',
    missing: [MissingItem.AddressNotFound],
    name: 'zielona',
    category: PlaceCategory.Cafe,
  },
  {
    id: 'several-matches',
    text: 'Mleczarnia, Meiselsa 20 — lovely garden in summer',
    expectKind: 'needs_choice',
    name: 'mleczarnia',
    address: 'meiselsa 20',
    notes: 'garden',
  },
  {
    id: 'duplicate',
    text: 'Sukiennice, Rynek Główny 1, Kraków',
    expectKind: 'duplicate',
    name: 'sukiennice',
  },
  { id: 'cant-question', text: 'Have we been to Camelot?', expectKind: 'cant_do' },
  { id: 'cant-delete', text: 'Delete Massolit from the list', expectKind: 'cant_do' },
  { id: 'cant-visited', text: 'Mark Pod Wawelem as visited', expectKind: 'cant_do' },
  { id: 'cant-unrelated', text: "What's the weather in Kraków tomorrow?", expectKind: 'cant_do' },
  { id: 'pl-cant-list', text: 'Jakie miejsca mamy na liście w Krakowie?', expectKind: 'cant_do' },
];

// The model's own reply, before the parser drops anything: extra keys and invented address
// words fail the case even when the outcome is right.
function gradeReply(evalCase: EvalCase, output: string | undefined): string | undefined {
  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(output ?? '') as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const extra = Object.keys(reply).filter((key) => !DRAFT_KEYS.has(key));
  if (extra.length > 0) return `extra keys: ${extra.join(', ')}`;
  if (typeof reply.address === 'string') {
    const prompt = new Set(words(evalCase.text));
    const added = words(reply.address).filter((word) => !prompt.has(word));
    if (added.length > 0) return `address expanded: ${added.join(' ')}`;
  }
  return undefined;
}

function gradeResponse(evalCase: EvalCase, response: PlaceDraftResponse): string | undefined {
  if (response.kind !== evalCase.expectKind) {
    return `kind ${response.kind} != ${evalCase.expectKind}`;
  }
  if (evalCase.missing && response.kind === 'needs_input') {
    const missing = response.missing.join(',');
    if (missing !== evalCase.missing.join(',')) return `missing ${missing}`;
  }
  if (!('draft' in response)) return undefined;
  const { draft } = response;
  if (evalCase.category && draft.category !== evalCase.category) {
    return `category ${draft.category} != ${evalCase.category}`;
  }
  for (const field of ['name', 'address', 'notes', 'url'] as const) {
    const expected = evalCase[field];
    if (expected && !fold(draft[field] ?? '').includes(fold(expected))) {
      return `${field} ${JSON.stringify(draft[field])} lacks "${expected}"`;
    }
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
  const drafts = new PlacesDraftService(model, geocoder, places);
  const results: Result[] = [];

  console.log(`model=${LLM_MODEL} trials=${trials}`);

  for (let trial = 1; trial <= trials; trial++) {
    for (const evalCase of CASES) {
      model.reset();
      let reason: string | undefined;
      const started = performance.now();
      try {
        const response = await drafts.draft(USER_ID, evalCase.text);
        reason = gradeReply(evalCase, model.outputs.at(-1)) ?? gradeResponse(evalCase, response);
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
