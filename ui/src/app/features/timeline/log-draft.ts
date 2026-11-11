import { DiaryDraft, NewDiaryNote, NoteEvent } from '../../core/diary/diary.service';
import { fromLocalDateTime, toLocalDateTime } from './timeline-format';

// The confirm card's editable copy of a draft. Times are datetime-local values in the account
// timezone. An event's `category` is '' (none), an existing category's id, or the `key` of one of
// `newCategories`, so renaming a proposed category keeps its events in it.
export type LogDraftEvent = {
  text: string;
  occurredAt: string;
  endsAt: string;
  // Drafted as a span: the card shows its end.
  span: boolean;
  category: string;
  extractorVersion: string | null;
};

export type LogDraftCategory = { key: string; name: string; description: string | null };

export type LogDraftForm = { events: LogDraftEvent[]; newCategories: LogDraftCategory[] };

export const NO_CATEGORY = '';
const NEW_CATEGORY_PREFIX = 'new:';

export const emptyLogDraft = (): LogDraftForm => ({ events: [], newCategories: [] });

export function toLogDraftForm(draft: DiaryDraft, timeZone: string): LogDraftForm {
  const newCategories = draft.newCategories.map((category, i) => ({
    key: `${NEW_CATEGORY_PREFIX}${i}`,
    name: category.name,
    description: category.description,
  }));
  const keyOf = new Map(newCategories.map((category) => [category.name, category.key]));
  return {
    events: draft.events.map((event) => ({
      text: event.text,
      occurredAt: toLocalDateTime(event.occurredAt, timeZone),
      endsAt: event.endsAt === null ? '' : toLocalDateTime(event.endsAt, timeZone),
      span: event.endsAt !== null,
      category: event.newCategory
        ? (keyOf.get(event.newCategory) ?? NO_CATEGORY)
        : (event.categoryId ?? NO_CATEGORY),
      extractorVersion: event.extractorVersion,
    })),
    newCategories,
  };
}

// Proposed categories no event is in any more are dropped: the API creates only used ones.
const withUsedCategories = (form: LogDraftForm): LogDraftForm => {
  const used = new Set(form.events.map((event) => event.category));
  return { ...form, newCategories: form.newCategories.filter(({ key }) => used.has(key)) };
};

export function withoutEvent(form: LogDraftForm, index: number): LogDraftForm {
  return withUsedCategories({ ...form, events: form.events.filter((_, i) => i !== index) });
}

// Its events are left without a category.
export function withoutCategory(form: LogDraftForm, key: string): LogDraftForm {
  return {
    events: form.events.map((event) =>
      event.category === key ? { ...event, category: NO_CATEGORY } : event,
    ),
    newCategories: form.newCategories.filter((category) => category.key !== key),
  };
}

export type NoteSource = { rawText: string; capturedAt: string; timeZone: string };

export function toNewNote(form: LogDraftForm, source: NoteSource): NewDiaryNote {
  const { newCategories } = withUsedCategories(form);
  const nameOf = new Map(newCategories.map((category) => [category.key, category.name.trim()]));
  const events = form.events.map((event): NoteEvent => {
    const newCategory = nameOf.get(event.category);
    return {
      text: event.text,
      occurredAt: fromLocalDateTime(event.occurredAt, source.timeZone),
      endsAt: event.endsAt ? fromLocalDateTime(event.endsAt, source.timeZone) : null,
      categoryId: newCategory || event.category === NO_CATEGORY ? null : event.category,
      ...(newCategory ? { newCategory } : {}),
      extractorVersion: event.extractorVersion,
    };
  });
  return {
    rawText: source.rawText,
    capturedAt: source.capturedAt,
    events,
    newCategories: newCategories.map(({ name, description }) => ({
      name: name.trim(),
      description,
    })),
  };
}
