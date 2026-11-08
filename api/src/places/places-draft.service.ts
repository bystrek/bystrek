import { Inject, Injectable } from '@nestjs/common';
import { GEOCODER, type GeocodedLocation, type Geocoder } from '../geo/geocoder';
import { LLM_CLIENT, type LlmClient } from '../llm/llm.client';
import { searchPlace } from './locate-place';
import { parseDraft, type PlaceDraft } from './places-draft.parse';
import { buildUserMessage, SYSTEM_PROMPT } from './places-draft.prompt';
import { PlacesService, type Place } from './places.service';

// What the user still has to add to the text before it can be saved.
export const MissingItem = {
  Name: 'name',
  Address: 'address',
  // The address is there, but the geocoder doesn't know it.
  AddressNotFound: 'address_not_found',
} as const;
export type MissingItem = (typeof MissingItem)[keyof typeof MissingItem];

export type CompleteDraft = PlaceDraft & { name: string; address: string };

// `ready` and `needs_choice` are confirmed by POST /places with the draft and the chosen
// location's osmType/osmId; choosing a candidate doesn't call the model again.
export type PlaceDraftResponse =
  | { kind: 'ready'; draft: CompleteDraft; location: GeocodedLocation }
  | { kind: 'needs_input'; draft: PlaceDraft; missing: MissingItem[] }
  | { kind: 'needs_choice'; draft: CompleteDraft; candidates: GeocodedLocation[] }
  | { kind: 'duplicate'; draft: CompleteDraft; place: Place }
  | { kind: 'cant_do'; text: string }
  | { kind: 'text'; text: string };

export const CANT_DO_TEXT = 'I can only add places.';
export const FALLBACK_TEXT = "I couldn't work that out. Try rephrasing it.";

// Long enough for a draft with a few sentences of notes and a link.
const MAX_REPLY_TOKENS = 600;

// One full prompt in, one draft out. Stateless: refining means sending the edited prompt
// again, never merging it with an earlier draft. An LlmError or GeocoderError passes through.
@Injectable()
export class PlacesDraftService {
  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    private readonly places: PlacesService,
  ) {}

  async draft(userId: string, text: string): Promise<PlaceDraftResponse> {
    const content = await this.llm.generateJson({
      system: SYSTEM_PROMPT,
      user: buildUserMessage(text),
      maxTokens: MAX_REPLY_TOKENS,
    });
    const parsed = parseDraft(content);
    if (!parsed) return { kind: 'text', text: FALLBACK_TEXT };
    if (parsed.kind === 'cant_do') return { kind: 'cant_do', text: CANT_DO_TEXT };

    const { draft } = parsed;
    if (!isComplete(draft)) return { kind: 'needs_input', draft, missing: missingFields(draft) };

    const candidates = await searchPlace(this.geocoder, draft.name, draft.address);
    if (candidates.length === 0) {
      return { kind: 'needs_input', draft, missing: [MissingItem.AddressNotFound] };
    }
    if (candidates.length > 1) return { kind: 'needs_choice', draft, candidates };

    const [location] = candidates;
    const existing = await this.places.findByOsm(userId, location.osmType, location.osmId);
    return existing
      ? { kind: 'duplicate', draft, place: existing }
      : { kind: 'ready', draft, location };
  }
}

function isComplete(draft: PlaceDraft): draft is CompleteDraft {
  return draft.name !== null && draft.address !== null;
}

function missingFields(draft: PlaceDraft): MissingItem[] {
  return [
    ...(draft.name === null ? [MissingItem.Name] : []),
    ...(draft.address === null ? [MissingItem.Address] : []),
  ];
}
