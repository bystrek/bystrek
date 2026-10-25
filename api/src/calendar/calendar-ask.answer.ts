import type { ParsedEvent } from './ical-event';
import type { ReadQuery, SearchQuery } from './calendar-ask.query';

export interface AskEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  startWeekday: string;
  durationMinutes: number;
}

export type AskResponse =
  | { kind: 'event'; event: AskEvent }
  | { kind: 'availability'; busy: boolean; text: string; conflicts: AskEvent[] }
  | { kind: 'list'; text: string; events: AskEvent[] }
  | { kind: 'text'; text: string }
  | { kind: 'cant_do'; text: string };

export const CANT_DO_TEXT = 'I can only read your calendar.';
export const FALLBACK_TEXT = "I couldn't work that out. Try rephrasing the question.";
const NO_EVENT_TEXT = 'No matching event.';

// Answers are composed here, never by the model. Events may arrive in any order.
export function buildAnswer(
  query: ReadQuery | SearchQuery,
  events: ParsedEvent[],
  now: Date,
): AskResponse {
  const timed = sortByStart(events);
  switch (query.kind) {
    case 'event':
      return pickEvent(query.pick, timed, now);
    case 'next':
      return pickEvent('next', timed, now);
    case 'find': {
      const search = query.search;
      return pickEvent(
        'next',
        timed.filter((event) => matchesSearch(event, search)),
        now,
      );
    }
    case 'availability':
      return availability(timed, query.start, query.end);
    case 'count':
      return {
        kind: 'text',
        text:
          timed.length === 0
            ? 'You have no events in that time.'
            : `You have ${pluralize(timed.length, 'event')} in that time.`,
      };
    case 'list':
      return {
        kind: 'list',
        text:
          timed.length === 0
            ? 'Nothing on your calendar in that time.'
            : `${pluralize(timed.length, 'event')}.`,
        events: timed.map(toAskEvent),
      };
  }
}

// Case-insensitive title match in either direction, so "dentist appointment" still finds
// "Dentist". `search` is already lowercased by parseQuery.
export function matchesSearch(event: ParsedEvent, search: string): boolean {
  const title = event.summary.trim().toLowerCase();
  return title !== '' && (title.includes(search) || search.includes(title));
}

type TimedEvent = ParsedEvent & { startMs: number; endMs: number };

function sortByStart(events: ParsedEvent[]): TimedEvent[] {
  return events
    .map((event) => ({ ...event, startMs: Date.parse(event.start), endMs: Date.parse(event.end) }))
    .sort((a, b) => a.startMs - b.startMs);
}

function pluralize(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function toAskEvent(event: TimedEvent): AskEvent {
  return {
    uid: event.uid,
    title: event.summary,
    start: event.start,
    end: event.end,
    startWeekday: event.startWeekday,
    durationMinutes: Math.round((event.endMs - event.startMs) / 60_000),
  };
}

function overlaps(event: TimedEvent, start: number, end: number): boolean {
  return event.startMs < end && event.endMs > start;
}

function pickEvent(pick: 'first' | 'last' | 'next', events: TimedEvent[], now: Date): AskResponse {
  const event =
    pick === 'first'
      ? events[0]
      : pick === 'last'
        ? events[events.length - 1]
        : events.find((candidate) => candidate.startMs >= now.getTime());
  return event
    ? { kind: 'event', event: toAskEvent(event) }
    : { kind: 'text', text: NO_EVENT_TEXT };
}

function availability(events: TimedEvent[], start: number, end: number): AskResponse {
  const conflicts = events.filter((event) => overlaps(event, start, end)).map(toAskEvent);
  if (conflicts.length === 0) {
    return { kind: 'availability', busy: false, text: 'You are free.', conflicts };
  }
  return {
    kind: 'availability',
    busy: true,
    text: `You are busy: ${conflicts.map((event) => event.title).join(', ')}.`,
    conflicts,
  };
}
