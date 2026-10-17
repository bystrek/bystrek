import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { weekBoundsAround } from '../calendar/zoned-time';
import { decryptField, encryptField } from '../crypto/field-encryption';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { conversations, messages, users } from '../db/schema';
import {
  CHAT_MODEL,
  type ChatMessage,
  type ChatModel,
  type ChatRole,
  type ChatToolCall,
} from './chat.model';
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

export interface ChatConversation {
  id: string;
  title: string;
  hasTitle: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';
}

function isChatToolCall(value: unknown): value is ChatToolCall {
  return isRecord(value) && typeof value.name === 'string' && isRecord(value.arguments);
}

export function parseStoredMessage(value: unknown, legacyRole: Role): ChatMessage | null {
  if (typeof value === 'string') {
    return value.length > 0 ? { role: legacyRole, content: value } : null;
  }

  if (Array.isArray(value)) {
    if (
      !value.every(
        (block) =>
          isRecord(block) &&
          (block.type === 'text' || block.type === 'tool_use' || block.type === 'tool_result'),
      )
    ) {
      throw new Error('Unsupported legacy chat content block');
    }
    const content = value
      .filter(
        (block): block is { type: 'text'; text: string } =>
          isRecord(block) && block.type === 'text' && typeof block.text === 'string',
      )
      .map((block) => block.text)
      .join('');
    return content.length > 0 ? { role: legacyRole, content } : null;
  }

  if (!isRecord(value) || !isChatRole(value.role) || typeof value.content !== 'string') {
    throw new Error('Unsupported stored chat message format');
  }

  const message: ChatMessage = {
    role: value.role,
    content: value.content,
  };
  if (value.toolName !== undefined) {
    if (typeof value.toolName !== 'string') {
      throw new Error('Unsupported stored chat message tool name');
    }
    message.toolName = value.toolName;
  }
  if (value.toolCalls !== undefined) {
    if (!Array.isArray(value.toolCalls) || !value.toolCalls.every(isChatToolCall)) {
      throw new Error('Unsupported stored chat message tool calls');
    }
    message.toolCalls = value.toolCalls;
  }
  return message;
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

  async listConversations(userId: string): Promise<ChatConversation[]> {
    const rows = await this.db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id));
    return rows.map((row) => ({
      id: row.id,
      title: row.title === null ? 'Chat' : decryptField(row.title),
      hasTitle: row.title !== null,
    }));
  }

  async createConversation(userId: string): Promise<ChatConversation> {
    const [row] = await this.db.insert(conversations).values({ userId }).returning({
      id: conversations.id,
    });
    return { id: row.id, title: 'New chat', hasTitle: false };
  }

  async requireConversation(userId: string, conversationId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
    if (!row) throw new NotFoundException('Conversation not found');
  }

  async reply(
    userId: string,
    conversationId: string,
    userText: string,
    onDelta: (text: string) => void,
    onComplete: (toolCalls: string[]) => void,
  ): Promise<void> {
    // One id per user message, shared across every tool-call iteration
    // below — lets a tool (e.g. calendar's confirm_calendar_action) refuse
    // to execute a staged action confirmed within the same request it was
    // proposed in, forcing a genuinely separate human turn in between.
    const requestId = randomUUID();
    const { timezone, locale } = await this.loadUserContext(userId);
    const history = await this.loadRecentMessages(conversationId);
    const conversation: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(timezone, locale) },
      ...history,
      { role: 'user', content: userText },
    ];
    await this.db
      .update(conversations)
      .set({ title: encryptField(userText.trim().slice(0, 80)) })
      .where(and(eq(conversations.id, conversationId), isNull(conversations.title)));
    await this.persist(userId, conversationId, { role: 'user', content: userText });

    const toolDefinitions = this.tools.map((tool) => tool.definition);
    const calledTools: string[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.model.complete(conversation, toolDefinitions, onDelta);

      conversation.push(response.message);
      await this.persist(userId, conversationId, response.message);

      if (!response.message.toolCalls?.length) {
        onComplete(calledTools);
        return;
      }

      const toolResults: ChatMessage[] = [];
      for (const toolCall of response.message.toolCalls) {
        calledTools.push(toolCall.name);
        const tool = this.tools.find((t) => t.definition.name === toolCall.name);
        const output = tool
          ? await tool.handler(toolCall.arguments, { userId, requestId, timezone })
          : { error: `no handler registered for tool "${toolCall.name}"` };
        toolResults.push({
          role: 'tool',
          content: JSON.stringify(output),
          toolName: toolCall.name,
        });
      }

      conversation.push(...toolResults);
      for (const toolResult of toolResults) {
        await this.persist(userId, conversationId, toolResult);
      }
    }

    onDelta('\n\n(Stopped after too many tool calls — try rephrasing.)');
    onComplete(calledTools);
  }

  // Deliberately bounded to the same RECENCY_WINDOW as the context sent to
  // the model, not the full persisted thread — see devlog day 9. Pagination
  // over older messages is a later addition if that ever proves
  // insufficient, same call as pgvector retrieval.
  async getHistory(userId: string, conversationId: string): Promise<ChatHistoryTurn[]> {
    await this.requireConversation(userId, conversationId);
    const history = await this.loadRecentMessages(conversationId);
    return toHistoryTurns(history);
  }

  async clearHistory(userId: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.userId, userId));
  }

  private async loadUserContext(userId: string): Promise<{ timezone: string; locale: string }> {
    const [row] = await this.db
      .select({ timezone: users.timezone, locale: users.locale })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new Error(`user ${userId} not found`);
    return row;
  }

  private async loadRecentMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(RECENCY_WINDOW);

    return rows.reverse().flatMap((row) => {
      const message = parseStoredMessage(JSON.parse(decryptField(row.content)), row.role);
      return message === null ? [] : [message];
    });
  }

  private async persist(
    userId: string,
    conversationId: string,
    message: ChatMessage,
  ): Promise<void> {
    if (message.role === 'system') throw new Error('Cannot persist a system message');
    await this.db.insert(messages).values({
      userId,
      conversationId,
      // The database's user/assistant roles intentionally remain UI-facing.
      // Ollama tool result messages are persisted as user rows but retain their
      // real role inside encrypted provider-neutral content for replay.
      role: message.role === 'tool' ? 'user' : message.role,
      content: encryptField(JSON.stringify(message)),
      contentFormat: 'ollama',
    });
    await this.db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }
}
