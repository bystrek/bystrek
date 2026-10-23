import type { ParsedEvent } from './ical-event';
import type { ReadQuery } from './calendar-ask.query';

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

// `events` must be sorted by start. Answers are composed here, never by the model.
export function buildAnswer(query: ReadQuery, events: ParsedEvent[], now: Date): AskResponse {
  switch (query.kind) {
    case 'event':
      return pickEvent(query.pick, events, now);
    case 'availability':
      return availability(events, query.start, query.end);
    case 'count':
      return {
        kind: 'text',
        text:
          events.length === 0
            ? 'You have no events in that time.'
            : `You have ${events.length} ${events.length === 1 ? 'event' : 'events'} in that time.`,
      };
    case 'list':
      return {
        kind: 'list',
        text:
          events.length === 0
            ? 'Nothing on your calendar in that time.'
            : `${events.length} ${events.length === 1 ? 'event' : 'events'}.`,
        events: events.map(toAskEvent),
      };
  }
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

function toAskEvent(event: ParsedEvent): AskEvent {
  return {
    uid: event.uid,
    title: event.summary,
    start: event.start,
    end: event.end,
    startWeekday: event.startWeekday,
    durationMinutes: durationMinutes(event.start, event.end),
  };
}

function overlaps(event: ParsedEvent, start: number, end: number): boolean {
  return new Date(event.start).getTime() < end && new Date(event.end).getTime() > start;
}

function pickEvent(pick: 'first' | 'last' | 'next', events: ParsedEvent[], now: Date): AskResponse {
  const event =
    pick === 'first'
      ? events[0]
      : pick === 'last'
        ? events[events.length - 1]
        : events.find((candidate) => new Date(candidate.start).getTime() >= now.getTime());
  return event
    ? { kind: 'event', event: toAskEvent(event) }
    : { kind: 'text', text: NO_EVENT_TEXT };
}

function availability(events: ParsedEvent[], start: number, end: number): AskResponse {
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
