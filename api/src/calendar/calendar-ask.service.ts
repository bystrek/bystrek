import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CHAT_MODEL, type ChatModel } from '../chat/chat.model';
import { CalendarService } from './calendar.service';
import type { ParsedEvent } from './ical-event';
import {
  formatZonedIso,
  parseZonedIso,
  upcomingDays,
  weekBoundsAround,
  weekdayName,
} from './zoned-time';

// Days listed in the user message so the model can map weekday names to dates.
export const DATES_AHEAD = 14;

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

const CANT_DO_TEXT = 'I can only read your calendar.';
const FALLBACK_TEXT = "I couldn't work that out. Try rephrasing the question.";
const NO_EVENT_TEXT = 'No matching event.';

const SYSTEM_PROMPT = [
  "You turn a question about the user's calendar into one JSON query. You never see the events; the server runs your query. Reply with exactly one JSON object and nothing else.",
  '',
  'Shapes:',
  '{"kind":"event","pick":"first"|"last"|"next","from":"<dt>","to":"<dt>"} - one specific event ("first event tomorrow", "my next meeting")',
  '{"kind":"availability","from":"<dt>","to":"<dt>"} - free/busy questions',
  '{"kind":"count","from":"<dt>","to":"<dt>"} - how many events',
  '{"kind":"list","from":"<dt>","to":"<dt>"} - which events, what\'s on, or show the agenda. Use this for any question about several events or a whole day or week, never "event"',
  '{"kind":"cant_do","text":"I can only read your calendar."} - any request to create, move, change, rename or delete',
  '',
  '<dt> is local time without offset: YYYY-MM-DDTHH:MM.',
  'Copy dates from the Dates line of the question. A weekday name means its date on the Weekdays line. A day of the month ("the 10th", "Oct 10th") means the entry with that date. Weeks run Monday to Sunday.',
  'Ranges: whole day = 00:00 to 23:59. Morning = 06:00-12:00, afternoon = 12:00-18:00, evening = 18:00-23:59. A single time ("at 3pm") = that time to one hour later. "Next" event: from = Now, to = 23:59 on the last listed date.',
  '',
  'Examples (for a different date; use the real Dates line):',
  'Now: Mon 2026-03-02 09:00',
  'Dates: Mon 2026-03-02 (today), Tue 2026-03-03, Wed 2026-03-04, Thu 2026-03-05, Fri 2026-03-06, Sat 2026-03-07, Sun 2026-03-08, Mon 2026-03-09, Tue 2026-03-10, Wed 2026-03-11, Thu 2026-03-12, Fri 2026-03-13, Sat 2026-03-14, Sun 2026-03-15',
  'Next week: Mon 2026-03-09 to Sun 2026-03-15',
  'Q: when is my first event tomorrow?',
  'A: {"kind":"event","pick":"first","from":"2026-03-03T00:00","to":"2026-03-03T23:59"}',
  'Q: am I free friday afternoon?',
  'A: {"kind":"availability","from":"2026-03-06T12:00","to":"2026-03-06T18:00"}',
  'Q: how many meetings next week?',
  'A: {"kind":"count","from":"2026-03-09T00:00","to":"2026-03-15T23:59"}',
  'Q: what events do I have on Tuesday?',
  'A: {"kind":"list","from":"2026-03-03T00:00","to":"2026-03-03T23:59"}',
  'Q: what is on the 10th?',
  'A: {"kind":"list","from":"2026-03-10T00:00","to":"2026-03-10T23:59"}',
  "Q: what's my next event?",
  'A: {"kind":"event","pick":"next","from":"2026-03-02T09:00","to":"2026-03-15T23:59"}',
  'Q: move my standup to 3pm',
  'A: {"kind":"cant_do","text":"I can only read your calendar."}',
].join('\n');

const QUERY_FORMAT = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['event', 'availability', 'count', 'list', 'cant_do'] },
    pick: { type: 'string', enum: ['first', 'last', 'next'] },
    from: { type: 'string' },
    to: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['kind'],
};

type Query =
  | { kind: 'event'; pick: 'first' | 'last' | 'next'; start: number; end: number }
  | { kind: 'availability' | 'count' | 'list'; start: number; end: number }
  | { kind: 'cant_do' };

const DT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseLocalTime(value: unknown, timezone: string): number | undefined {
  if (typeof value !== 'string' || !DT_PATTERN.test(value)) return undefined;
  try {
    const time = parseZonedIso(value, timezone).getTime();
    return Number.isNaN(time) ? undefined : time;
  } catch {
    return undefined;
  }
}

// Validates the model's JSON. Anything malformed becomes undefined, which the
// caller answers with the fallback text rather than guessing a query.
export function parseQuery(content: string, timezone: string): Query | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const query = value as Record<string, unknown>;

  if (query.kind === 'cant_do') return { kind: 'cant_do' };

  const start = parseLocalTime(query.from, timezone);
  const end = parseLocalTime(query.to, timezone);
  if (start === undefined || end === undefined || end <= start) return undefined;

  if (
    query.kind === 'event' &&
    (query.pick === 'first' || query.pick === 'last' || query.pick === 'next')
  ) {
    return { kind: 'event', pick: query.pick, start, end };
  }
  if (query.kind === 'availability' || query.kind === 'count' || query.kind === 'list') {
    return { kind: query.kind, start, end };
  }
  return undefined;
}

function buildUserMessage(question: string, now: Date, timezone: string): string {
  const week = weekBoundsAround(now, timezone);
  const nowLabel = formatZonedIso(now, timezone).slice(0, 16).replace('T', ' ');
  return [
    `Now: ${weekdayName(now, timezone).slice(0, 3)} ${nowLabel}`,
    `Dates: ${shortDates(now, timezone).join(', ')}`,
    `Weekdays: ${nextWeekdays(now, timezone).join(', ')}`,
    `This week: ${week.thisWeekStart} to ${week.thisWeekEnd}. Next week: ${week.nextWeekStart} to ${week.nextWeekEnd}.`,
    `Q: ${question}`,
  ].join('\n');
}

function shortDates(now: Date, timezone: string): string[] {
  return upcomingDays(now, timezone, DATES_AHEAD).map((entry) => {
    const weekday = entry.slice(0, 3);
    return `${weekday} ${entry.slice(entry.indexOf(' ') + 1)}`;
  });
}

// The next occurrence of each weekday, so a bare weekday name maps to one date.
function nextWeekdays(now: Date, timezone: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const entry of upcomingDays(now, timezone, DATES_AHEAD)) {
    const weekday = entry.slice(0, 3);
    if (seen.has(weekday)) continue;
    seen.add(weekday);
    found.push(`${weekday}=${entry.match(/\d{4}-\d{2}-\d{2}/)?.[0]}`);
  }
  return found;
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

@Injectable()
export class CalendarAskService {
  constructor(
    @Inject(CHAT_MODEL) private readonly model: ChatModel,
    private readonly calendar: CalendarService,
  ) {}

  async ask(userId: string, timezone: string, question: string): Promise<AskResponse> {
    const now = new Date();
    let content: string;
    try {
      content = await this.model.generate(
        SYSTEM_PROMPT,
        buildUserMessage(question, now, timezone),
        QUERY_FORMAT,
      );
    } catch {
      throw new ServiceUnavailableException("Couldn't reach the calendar assistant.");
    }

    const query = parseQuery(content, timezone);
    if (!query) return { kind: 'text', text: FALLBACK_TEXT };
    if (query.kind === 'cant_do') return { kind: 'cant_do', text: CANT_DO_TEXT };

    const events = await this.listEvents(userId, query.start, query.end, timezone);

    switch (query.kind) {
      case 'event':
        return this.pickEvent(query.pick, events, now);
      case 'availability':
        return this.availability(events, query.start, query.end);
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

  private async listEvents(
    userId: string,
    start: number,
    end: number,
    timezone: string,
  ): Promise<ParsedEvent[]> {
    try {
      const events = await this.calendar.listEvents(
        userId,
        { start: new Date(start), end: new Date(end) },
        timezone,
      );
      return [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    } catch {
      throw new ServiceUnavailableException("Couldn't read your calendar.");
    }
  }

  private pickEvent(
    pick: 'first' | 'last' | 'next',
    events: ParsedEvent[],
    now: Date,
  ): AskResponse {
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

  private availability(events: ParsedEvent[], start: number, end: number): AskResponse {
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
}
