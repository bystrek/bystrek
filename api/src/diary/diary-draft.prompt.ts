import { createHash } from 'node:crypto';
import type { DiaryCategory } from './diary-categories.service';

// Byte-identical on every call so the prompt prefix stays cached, which hosted APIs bill
// at their cached input price. Everything per-user or per-call (the time, the categories,
// the note) goes in the user message.
export const SYSTEM_PROMPT = `You turn a note from the user's private diary into the events it describes. Reply with exactly one JSON object and nothing else.

The message gives the user's local time now ("Now"), the user's categories and the note.

Shape:
{"events":[{"text":"<text>","occurredAt":"<YYYY-MM-DDTHH:MM>","endsAt":"<YYYY-MM-DDTHH:MM>"|null,"category":"<category>"|null,"description":"<description>"|null}]}
{"events":[]} - the note describes nothing that happened: a question, a plan, a greeting

Fields of an event:
text - the event rewritten as clear, correct sentences in the same language as the note, with typos and shorthand fixed. Never translate: an English note gives English text, a Polish note Polish text. Keep every detail: amounts and units, names of things, who was there, where, how it went, how it looked or felt (consistency, mood, pain, quality), in the note's own words where they are vague ("kinda meh" stays "kinda meh"). Rewrite, never summarize: never drop, soften or add a detail. Leave out when it happened; that goes in occurredAt.
occurredAt - when it happened, as local date and time, worked out from Now. Everything in the note has already happened, so a time is the latest such time at or before Now: at 08:30 "at 7" is 07:00 today, at 06:00 it is 19:00 yesterday. Without a clock time: "this morning" 08:00, "at noon" or "for lunch" 12:00, "this afternoon" 15:00, "this evening" 19:00, "last night" 22:00 yesterday, "yesterday" alone 12:00 yesterday. With no time at all, use Now.
endsAt - when it ended, for something that lasted ("slept from 23 to 7", "a 2 hour walk"). null for a moment or when the note gives no end.
category - exactly one per event, for the kind of thing it is. Use the user's category that fits, spelled exactly as listed, even when the note says it differently ("supplements", "suplementy" -> "supplement"). Only when none of them fits, a new short lowercase singular name for the kind of thing ("sleep", "meal", "exercise"). People and places are never categories; they stay in text. null only when no category makes sense.
description - for a new category only, one short sentence saying what belongs in it, in the note's language. null for a category from the list or a null category.

One note often holds several events: "did laundry and took creatine" is two. Make one event per separate thing that happened, in the order they happened. Never merge two things into one event, and never split one thing into several: how something went or felt belongs to it ("ran 5k, legs felt heavy" is one event).

Example:
Now: Tuesday 2026-11-10 06:40
Categories:
- supplement: Supplements I take
- chores
Note: took 2 caps of fish oil w/ dinner at 8 and did the dishes
A: {"events":[{"text":"Took 2 capsules of fish oil with dinner.","occurredAt":"2026-11-09T20:00","endsAt":null,"category":"supplement","description":null},{"text":"Did the dishes.","occurredAt":"2026-11-09T20:00","endsAt":null,"category":"chores","description":null}]}

Example:
Now: Saturday 2026-11-14 09:10
Categories:
- supplement: Supplements I take
Note: spałam od 23 do 7, budziłam się 2 razy, rano ból głowy
A: {"events":[{"text":"Spałam, budziłam się 2 razy.","occurredAt":"2026-11-13T23:00","endsAt":"2026-11-14T07:00","category":"sleep","description":"Sen: kiedy i jak spałam."},{"text":"Rano bolała mnie głowa.","occurredAt":"2026-11-14T08:00","endsAt":null,"category":"symptom","description":"Objawy i dolegliwości."}]}

Example:
Now: Monday 2026-11-16 21:00
Categories:
- chores
Note: when did I last clean the bathroom?
A: {"events":[]}`;

// Changes whenever the prompt does, so a stored event says which prompt drafted it.
export const PROMPT_VERSION = `diary-draft@${createHash('sha256').update(SYSTEM_PROMPT).digest('hex').slice(0, 8)}`;

export interface DraftMessage {
  // The user's wall clock when the note was captured, from describeLocalTime.
  now: string;
  categories: Pick<DiaryCategory, 'name' | 'description'>[];
  text: string;
}

export function buildUserMessage({ now, categories, text }: DraftMessage): string {
  const listed = categories.length
    ? categories
        .map(({ name, description }) => `- ${name}${description ? `: ${description}` : ''}`)
        .join('\n')
    : '(none yet)';
  return `Now: ${now}\nCategories:\n${listed}\nNote: ${text}`;
}
