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
import {
  buildAnswer,
  CANT_DO_TEXT,
  FALLBACK_TEXT,
  matchesSearch,
  type AskResponse,
} from './calendar-ask.answer';
import { parseQuery } from './calendar-ask.query';
import { buildUserMessage, QUERY_FORMAT, SYSTEM_PROMPT } from './calendar-ask.prompt';
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

  // `now` is only overridden by the model eval, which replays questions on other days.
  async ask(
    userId: string,
    timezone: string,
    question: string,
    now = new Date(),
  ): Promise<AskResponse> {
    // One model call: the reply names dates in words, and parseQuery resolves them against now.
    const content = await this.complete(SYSTEM_PROMPT, buildUserMessage(question), QUERY_FORMAT);

    const query = parseQuery(content, timezone, now);
    if (!query) return { kind: 'text', text: FALLBACK_TEXT };
    if (query.kind === 'cant_do') return { kind: 'cant_do', text: CANT_DO_TEXT };

    // Model -> query -> CalDAV read -> deterministic answer. The model never sees events.
    const events =
      query.kind === 'next' || query.kind === 'find'
        ? await this.searchForward(
            userId,
            query.kind === 'find' ? query.search : undefined,
            timezone,
            now,
          )
        : await this.listEvents(userId, query.start, query.end, timezone);
    return buildAnswer(query, events, now);
  }

  private async complete(system: string, user: string, format: Record<string, unknown>) {
    try {
      return await this.model.generate(system, user, format);
    } catch {
      throw new ServiceUnavailableException("Couldn't reach the calendar assistant.");
    }
  }

  // Widens forward from now in steps until an event at or after now turns up, or,
  // with a search keyword, one whose title matches. Stops at the horizon.
  private async searchForward(
    userId: string,
    search: string | undefined,
    timezone: string,
    now: Date,
  ): Promise<ParsedEvent[]> {
    const horizon = now.getTime() + NEXT_SEARCH_HORIZON_MS;
    let windowStart = now.getTime();
    for (;;) {
      const windowEnd = Math.min(windowStart + NEXT_SEARCH_STEP_MS, horizon);
      const events = await this.listEvents(userId, windowStart, windowEnd, timezone);
      const found = events.some(
        (event) =>
          Date.parse(event.start) >= now.getTime() && (!search || matchesSearch(event, search)),
      );
      if (found || windowEnd >= horizon) return events;
      windowStart = windowEnd;
    }
  }

  private async listEvents(
    userId: string,
    start: number,
    end: number,
    timezone: string,
  ): Promise<ParsedEvent[]> {
    try {
      return await this.calendar.listEvents(
        userId,
        { start: new Date(start), end: new Date(end) },
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
