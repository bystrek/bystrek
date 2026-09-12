import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { weekBoundsAround } from '../calendar/zoned-time';
import { decryptField, encryptField } from '../crypto/field-encryption';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { messages, users } from '../db/schema';
import { CHAT_MODEL, type ChatMessage, type ChatModel } from './chat.model';
import { CHAT_TOOLS, type ChatTool } from './chat.tools';

// Context sent to the model per request is a bounded recency window, not the
// full stored thread — see devlog day 9. Retrieval over older messages via
// pgvector is a later addition if this ever proves insufficient.
const RECENCY_WINDOW = 40;
// Caps a single reply to this many model round-trips, so a tool that keeps
// triggering another tool_use (or a model stuck in a loop) can't hold the
// request open forever.
export const MAX_TOOL_ITERATIONS = 8;

// Computed per request from the user's own timezone/locale (`users` table
// — no settings UI yet, defaults only), not baked into a constant: without
// today's actual date, the model guesses from training-data recency when
// resolving relative ranges like "next 30 days" — confirmed live, it
// guessed Dec 2024 instead of Aug 2026, which sent calendar tool calls a
// year and a half off and silently returned zero events. See devlog day 12.
function buildSystemPrompt(timezone: string, locale: string): string {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const week = weekBoundsAround(now, timezone);

  return (
    'You are the personal assistant built into bystrek, a household data platform. ' +
    'Be direct and concise. ' +
    `The current date and time is ${formatted} (${timezone}), machine-readable as ${now.toISOString()}. ` +
    `Use this as "now" for any relative date/time reference — never guess it from training data. ` +
    'Weeks run Monday to Sunday. ' +
    `This week: ${week.thisWeekStart} through ${week.thisWeekEnd}. ` +
    `Next week: ${week.nextWeekStart} through ${week.nextWeekEnd}. ` +
    `When calling a tool with date/time inputs, use ISO 8601 in ${timezone}. ` +
    `Calendar tool results are already formatted in ${timezone} (with an explicit UTC offset) and ` +
    `carry a startWeekday/endWeekday label — relay times and weekdays as given, never re-derive them.`
  );
}

type Role = 'user' | 'assistant';

export interface ChatHistoryTurn {
  role: Role;
  text: string;
}

// Collapses one stored turn's content down to plain text for `GET
// /chat/history` — text-only for v1 (see devlog day 9), so a turn with no
// text block (pure tool_use/tool_result) has nothing to show and is dropped
// by the caller.
export function collapseTurnText(message: ChatMessage): string | null {
  return message.content.length > 0 ? message.content : null;
}

export function toHistoryTurns(messages: ChatMessage[]): ChatHistoryTurn[] {
  return messages.flatMap((message) => {
    const text = collapseTurnText(message);
    return text === null || message.role === 'system' || message.role === 'tool'
      ? []
      : [{ role: message.role, text }];
  });
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(CHAT_MODEL) private readonly model: ChatModel,
    @Inject(CHAT_TOOLS) private readonly tools: ChatTool[],
  ) {}

  async reply(userId: string, userText: string, onDelta: (text: string) => void): Promise<void> {
    // One id per user message, shared across every tool-call iteration
    // below — lets a tool (e.g. calendar's confirm_calendar_action) refuse
    // to execute a staged action confirmed within the same request it was
    // proposed in, forcing a genuinely separate human turn in between.
    const requestId = randomUUID();
    const { timezone, locale } = await this.loadUserContext(userId);
    const history = await this.loadRecentMessages(userId);
    const conversation: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(timezone, locale) },
      ...history,
      { role: 'user', content: userText },
    ];
    await this.persist(userId, { role: 'user', content: userText });

    const toolDefinitions = this.tools.map((tool) => tool.definition);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.model.complete(conversation, toolDefinitions, onDelta);

      conversation.push(response.message);
      await this.persist(userId, response.message);

      if (!response.message.toolCalls?.length) {
        return;
      }

      const toolResults: ChatMessage[] = [];
      for (const toolCall of response.message.toolCalls) {
        const tool = this.tools.find((t) => t.definition.name === toolCall.name);
        const output = tool
          ? await tool.handler(toolCall.arguments, { userId, requestId, timezone })
          : { error: `no handler registered for tool "${toolCall.name}"` };
        toolResults.push({
          role: 'tool',
          content: JSON.stringify(output),
        });
      }

      conversation.push(...toolResults);
      for (const toolResult of toolResults) {
        await this.persist(userId, toolResult);
      }
    }

    onDelta('\n\n(Stopped after too many tool calls — try rephrasing.)');
  }

  // Deliberately bounded to the same RECENCY_WINDOW as the context sent to
  // the model, not the full persisted thread — see devlog day 9. Pagination
  // over older messages is a later addition if that ever proves
  // insufficient, same call as pgvector retrieval.
  async getHistory(userId: string): Promise<ChatHistoryTurn[]> {
    const history = await this.loadRecentMessages(userId);
    return toHistoryTurns(history);
  }

  private async loadUserContext(userId: string): Promise<{ timezone: string; locale: string }> {
    const [row] = await this.db
      .select({ timezone: users.timezone, locale: users.locale })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new Error(`user ${userId} not found`);
    return row;
  }

  private async loadRecentMessages(userId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(RECENCY_WINDOW);

    return rows.reverse().map((row) => JSON.parse(decryptField(row.content)) as ChatMessage);
  }

  private async persist(userId: string, message: ChatMessage): Promise<void> {
    if (message.role === 'system') throw new Error('Cannot persist a system message');
    await this.db.insert(messages).values({
      userId,
      // The database's user/assistant roles intentionally remain UI-facing.
      // Ollama tool result messages are persisted as user rows but retain their
      // real role inside encrypted provider-neutral content for replay.
      role: message.role === 'tool' ? 'user' : message.role,
      content: encryptField(JSON.stringify(message)),
      contentFormat: 'ollama',
    });
  }
}
