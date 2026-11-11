import type { DiaryCategory } from './diary-categories.service';
import type { ModelEvent } from './diary-draft.parse';
import { intoPast, localTimeToDate } from './diary-draft.time';
import { isValidSpan } from './diary.dto';

// One event on the confirm card, shaped like an event of POST /diary/notes: its category is
// an existing one (`categoryId`), one of the draft's `newCategories` (`newCategory`), or none.
export interface DraftEvent {
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  categoryId: string | null;
  newCategory?: string;
  extractorVersion: string;
}

export interface DraftCategory {
  name: string;
  description: string | null;
}

export interface DiaryDraft {
  events: DraftEvent[];
  newCategories: DraftCategory[];
}

export interface DraftContext {
  capturedAt: Date;
  timeZone: string;
  categories: DiaryCategory[];
  extractorVersion: string;
}

const key = (name: string) => name.trim().toLowerCase();

// Resolves what the model wrote against the user's clock and categories. A missing or
// unreadable time is when the note was captured, a time in the future moves into the past
// (see intoPast), and an end before the start is dropped. A category name the user already
// has, in any case, is that category; any other name is proposed once, with the first
// description given for it.
export function buildDraft(events: ModelEvent[], context: DraftContext): DiaryDraft {
  const { capturedAt, timeZone, extractorVersion } = context;
  const existing = new Map(context.categories.map((category) => [key(category.name), category]));
  const proposed = new Map<string, DraftCategory>();

  const draftEvents = events.map((event): DraftEvent => {
    const { start: occurredAt, end: endsAt } = intoPast(
      {
        start: toDate(event.occurredAt, timeZone) ?? capturedAt,
        end: toDate(event.endsAt, timeZone) ?? null,
      },
      capturedAt,
      timeZone,
    );
    const base = {
      text: event.text,
      occurredAt,
      endsAt: isValidSpan(occurredAt, endsAt) ? endsAt : null,
      extractorVersion,
    };
    if (event.category === null) return { ...base, categoryId: null };

    const match = existing.get(key(event.category));
    if (match) return { ...base, categoryId: match.id };
    const category = proposed.get(key(event.category)) ?? {
      name: event.category,
      description: event.description,
    };
    proposed.set(key(event.category), category);
    return { ...base, categoryId: null, newCategory: category.name };
  });

  return { events: draftEvents, newCategories: [...proposed.values()] };
}

function toDate(value: string | null, timeZone: string): Date | undefined {
  return value === null ? undefined : localTimeToDate(value, timeZone);
}
