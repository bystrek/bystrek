import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CHAT_MODEL, type ChatModel } from '../chat/chat.model';
import {
  CalendarNotConfiguredError,
  CalendarService,
  CalendarUrlMismatchError,
} from './calendar.service';
import { buildAnswer, CANT_DO_TEXT, FALLBACK_TEXT, type AskResponse } from './calendar-ask.answer';
import { parseReferencedDates } from './calendar-ask.dates';
import { parseQuery, type ReadQuery } from './calendar-ask.query';
import {
  buildDiscoveryMessage,
  buildUserMessage,
  DISCOVERY_FORMAT,
  DISCOVERY_PROMPT,
  QUERY_FORMAT,
  SYSTEM_PROMPT,
} from './calendar-ask.prompt';
import type { ParsedEvent } from './ical-event';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_SEARCH_STEP_MS = 30 * DAY_MS;
const NEXT_SEARCH_HORIZON_MS = 365 * DAY_MS;

@Injectable()
export class CalendarAskService {
  constructor(
    @Inject(CHAT_MODEL) private readonly model: ChatModel,
    private readonly calendar: CalendarService,
  ) {}

  async ask(userId: string, timezone: string, question: string): Promise<AskResponse> {
    const now = new Date();
    const referenced = parseReferencedDates(
      await this.complete(
        DISCOVERY_PROMPT,
        buildDiscoveryMessage(question, now, timezone),
        DISCOVERY_FORMAT,
      ),
    );
    const content = await this.complete(
      SYSTEM_PROMPT,
      buildUserMessage(question, now, timezone, referenced),
      QUERY_FORMAT,
    );

    const query = parseQuery(content, timezone);
    if (!query) return { kind: 'text', text: FALLBACK_TEXT };
    if (query.kind === 'cant_do') return { kind: 'cant_do', text: CANT_DO_TEXT };

    // Model -> query -> CalDAV read -> deterministic answer. The model never sees events.
    const events =
      query.kind === 'event' && query.pick === 'next'
        ? await this.searchForward(userId, query, timezone, now)
        : await this.listEvents(userId, query, timezone);
    return buildAnswer(query, events, now);
  }

  private async complete(system: string, user: string, format: Record<string, unknown>) {
    try {
      return await this.model.generate(system, user, format);
    } catch {
      throw new ServiceUnavailableException("Couldn't reach the calendar assistant.");
    }
  }

  // The model's window only covers the dates it was shown, so "next" widens it
  // forward in steps until an event at or after now turns up or the horizon is reached.
  private async searchForward(
    userId: string,
    query: ReadQuery,
    timezone: string,
    now: Date,
  ): Promise<ParsedEvent[]> {
    const horizon = query.start + NEXT_SEARCH_HORIZON_MS;
    let windowStart = query.start;
    let windowEnd = query.end;
    for (;;) {
      const events = await this.listEvents(
        userId,
        { kind: 'list', start: windowStart, end: windowEnd },
        timezone,
      );
      const found = events.some((event) => Date.parse(event.start) >= now.getTime());
      if (found || windowEnd >= horizon) return events;
      windowStart = windowEnd;
      windowEnd = Math.min(windowEnd + NEXT_SEARCH_STEP_MS, horizon);
    }
  }

  private async listEvents(
    userId: string,
    query: ReadQuery,
    timezone: string,
  ): Promise<ParsedEvent[]> {
    try {
      return await this.calendar.listEvents(
        userId,
        { start: new Date(query.start), end: new Date(query.end) },
        timezone,
      );
    } catch (err) {
      if (err instanceof CalendarNotConfiguredError || err instanceof CalendarUrlMismatchError) {
        throw new BadRequestException(err.message);
      }
      throw new ServiceUnavailableException("Couldn't read your calendar.");
    }
  }
}
