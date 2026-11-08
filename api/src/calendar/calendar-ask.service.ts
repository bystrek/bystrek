import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LLM_CLIENT, type LlmClient, type LlmJsonRequest } from '../llm/llm.client';
import {
  CalendarNotConfiguredError,
  CalendarNotReadyError,
  CalendarUrlMismatchError,
} from './calendar.errors';
import { CalendarService, type CalendarSnapshot } from './calendar.service';
import {
  buildAnswer,
  CANT_DO_TEXT,
  FALLBACK_TEXT,
  matchesSearch,
  type AskResponse,
} from './calendar-ask.answer';
import { parseQuery } from './calendar-ask.query';
import { currentDate, fromEpochMs, parseOffsetIso } from './zoned-time';
import { buildUserMessage, SYSTEM_PROMPT } from './calendar-ask.prompt';
import type { ParsedEvent } from './ical-event';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_SEARCH_STEP_MS = 30 * DAY_MS;
const NEXT_SEARCH_HORIZON_MS = 365 * DAY_MS;

@Injectable()
export class CalendarAskService {
  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly calendar: CalendarService,
  ) {}

  // `now` is only overridden by the model eval, which replays questions on other days.
  async ask(
    userId: string,
    timezone: string,
    question: string,
    now = currentDate(),
  ): Promise<AskResponse> {
    // One model call: the reply names dates in words, and parseQuery resolves them against now.
    const content = await this.generateJson({
      system: SYSTEM_PROMPT,
      user: buildUserMessage(question),
      // The longest query shape, with room to spare.
      maxTokens: 80,
    });

    const query = parseQuery(content, timezone, now);
    if (!query) return { kind: 'text', text: FALLBACK_TEXT };
    if (query.kind === 'cant_do') return { kind: 'cant_do', text: CANT_DO_TEXT };

    // Model -> query -> calendar read -> deterministic answer. The model never sees events.
    const snapshot = await this.openSnapshot(userId, timezone);
    const events =
      query.kind === 'next' || query.kind === 'find'
        ? this.searchForward(snapshot, query.kind === 'find' ? query.search : undefined, now)
        : snapshot.listEvents({ start: fromEpochMs(query.start), end: fromEpochMs(query.end) });
    return buildAnswer(query, events, now);
  }

  private async generateJson(request: LlmJsonRequest) {
    try {
      return await this.llm.generateJson(request);
    } catch {
      throw new ServiceUnavailableException("Couldn't reach the calendar assistant.");
    }
  }

  // Widens forward from now in steps until an event at or after now turns up, or,
  // with a search keyword, one whose title matches. Stops at the horizon. Every window
  // comes from the same snapshot, so the server is checked once per question.
  private searchForward(
    snapshot: CalendarSnapshot,
    search: string | undefined,
    now: Date,
  ): ParsedEvent[] {
    const horizon = now.getTime() + NEXT_SEARCH_HORIZON_MS;
    let windowStart = now.getTime();
    for (;;) {
      const windowEnd = Math.min(windowStart + NEXT_SEARCH_STEP_MS, horizon);
      const events = snapshot.listEvents({
        start: fromEpochMs(windowStart),
        end: fromEpochMs(windowEnd),
      });
      const found = events.some(
        (event) =>
          parseOffsetIso(event.start).getTime() >= now.getTime() &&
          (!search || matchesSearch(event, search)),
      );
      if (found || windowEnd >= horizon) return events;
      windowStart = windowEnd;
    }
  }

  private async openSnapshot(userId: string, timezone: string): Promise<CalendarSnapshot> {
    try {
      return await this.calendar.openSnapshot(userId, timezone);
    } catch (err) {
      if (err instanceof CalendarNotConfiguredError || err instanceof CalendarUrlMismatchError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof CalendarNotReadyError) throw new ConflictException(err.message);
      throw new ServiceUnavailableException("Couldn't read your calendar.");
    }
  }
}
