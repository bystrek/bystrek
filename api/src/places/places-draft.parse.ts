import { z } from 'zod';
import { PlaceCategory } from './place-category';

// What the model made of the user's text. Any field may be missing; the caller decides what
// to ask for. There is no location here: the server geocodes `address`.
export interface PlaceDraft {
  name: string | null;
  category: PlaceCategory;
  address: string | null;
  notes: string | null;
  url: string | null;
}

export type ParsedDraft = { kind: 'place'; draft: PlaceDraft } | { kind: 'cant_do' };

// A blank or absent field is null. Limits match what POST /places accepts.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

// Unknown keys (coordinates included) are dropped. A field the model got only slightly wrong
// becomes its default instead of failing the whole draft.
const ModelReply = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cant_do') }),
  z.object({
    kind: z.literal('place'),
    name: text(200),
    category: z.enum(PlaceCategory).catch(PlaceCategory.Other),
    address: text(500),
    notes: text(2000),
    url: z.httpUrl().max(2000).nullable().catch(null),
  }),
]);

// Validates the model's JSON. Anything malformed becomes undefined, which the caller answers
// with the fallback text rather than guessing.
export function parseDraft(content: string): ParsedDraft | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  const reply = ModelReply.safeParse(value);
  if (!reply.success) return undefined;
  if (reply.data.kind === 'cant_do') return { kind: 'cant_do' };
  const { kind, ...draft } = reply.data;
  return { kind, draft };
}
