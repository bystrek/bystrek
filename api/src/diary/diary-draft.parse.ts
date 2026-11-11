import { z } from 'zod';
import { categoryDescription, categoryName, eventText } from './diary.dto';

// A field the model got slightly wrong (blank, too long, wrong type) becomes null instead of
// failing the whole draft; the user confirms every event anyway.
const orNull = (schema: z.ZodString) =>
  schema
    .nullish()
    .transform((value) => value || null)
    .catch(null);

// One event as the model wrote it: times are still wall-clock strings and the category is
// still a name; buildDraft resolves both. Text is required: an event without it is no event.
const ModelEvent = z.object({
  text: eventText,
  occurredAt: orNull(z.string()),
  endsAt: orNull(z.string()),
  category: orNull(categoryName),
  description: orNull(categoryDescription),
});
export type ModelEvent = z.infer<typeof ModelEvent>;

const ModelReply = z.object({ events: z.array(ModelEvent).max(50) });

// Validates the model's JSON. Anything malformed becomes undefined, which the caller answers
// with the fallback text rather than guessing. No events is valid: nothing to log.
export function parseReply(content: string): ModelEvent[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  return ModelReply.safeParse(value).data?.events;
}
