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
import { parseQuery, type ReadQuery } from './calendar-ask.query';
import { buildUserMessage, QUERY_FORMAT, SYSTEM_PROMPT } from './calendar-ask.prompt';
import type { ParsedEvent } from './ical-event';

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

    // Model -> query -> CalDAV read -> deterministic answer. The model never sees events.
    const events = await this.listEvents(userId, query, timezone);
    return buildAnswer(query, events, now);
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
