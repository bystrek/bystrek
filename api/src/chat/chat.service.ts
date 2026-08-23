import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { decryptField, encryptField } from '../crypto/field-encryption';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { messages } from '../db/schema';
import { ANTHROPIC_MODEL } from '../env';
import { ANTHROPIC } from './anthropic.provider';
import { CHAT_TOOLS, type ChatTool } from './chat.tools';

// Context sent to Claude per request is a bounded recency window, not the
// full stored thread — see devlog day 9. Retrieval over older messages via
// pgvector is a later addition if this ever proves insufficient.
const RECENCY_WINDOW = 40;
const MAX_TOKENS = 1024;
// Caps a single reply to this many Claude round-trips, so a tool that keeps
// triggering another tool_use (or a model stuck in a loop) can't hold the
// request open forever.
export const MAX_TOOL_ITERATIONS = 8;
// Only user so far, so a fixed timezone rather than a per-user setting —
// revisit once there's more than one household member using this.
const TIMEZONE = 'Europe/Warsaw';

// Computed per request, not baked into a constant: without today's actual
// date, the model guesses from training-data recency when resolving
// relative ranges like "next 30 days" — confirmed live, it guessed
// Dec 2024 instead of Aug 2026, which sent calendar tool calls a year and a
// half off and silently returned zero events. See devlog day 12.
function buildSystemPrompt(): string {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return (
    'You are the personal assistant built into bystrek, a household data platform. ' +
    'Be direct and concise. ' +
    `The current date and time is ${formatted} (${TIMEZONE}), machine-readable as ${now.toISOString()}. ` +
    `Use this as "now" for any relative date/time reference — never guess it from training data. ` +
    `When calling a tool with date/time inputs, use ISO 8601 in ${TIMEZONE}.`
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
export function collapseTurnText(content: Anthropic.MessageParam['content']): string | null {
  if (typeof content === 'string') {
    return content.length > 0 ? content : null;
  }
  const text = content
    .filter((block): block is Anthropic.TextBlockParam => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return text.length > 0 ? text : null;
}

// `Anthropic.MessageParam['role']` also allows `'system'`, which this app
// never persists (`persist()` only ever writes the `Role` above) — narrowed
// back to `Role` here rather than widening `ChatHistoryTurn` to match.
export function toHistoryTurns(messages: Anthropic.MessageParam[]): ChatHistoryTurn[] {
  return messages.flatMap((message) => {
    const text = collapseTurnText(message.content);
    return text === null ? [] : [{ role: message.role as Role, text }];
  });
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(ANTHROPIC) private readonly anthropic: Anthropic,
    @Inject(CHAT_TOOLS) private readonly tools: ChatTool[],
  ) {}

  async reply(userId: string, userText: string, onDelta: (text: string) => void): Promise<void> {
    const history = await this.loadRecentMessages(userId);
    const conversation: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];
    await this.persist(userId, 'user', userText);

    const toolDefinitions = this.tools.map((tool) => tool.definition);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = this.anthropic.messages.stream({
        model: ANTHROPIC_MODEL,
        system: buildSystemPrompt(),
        max_tokens: MAX_TOKENS,
        messages: conversation,
        tools: toolDefinitions,
      });
      stream.on('text', onDelta);
      const response = await stream.finalMessage();

      conversation.push({ role: 'assistant', content: response.content });
      await this.persist(userId, 'assistant', response.content);

      if (response.stop_reason !== 'tool_use') {
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const tool = this.tools.find((t) => t.definition.name === block.name);
        const output = tool
          ? await tool.handler(block.input, userId)
          : { error: `no handler registered for tool "${block.name}"` };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }

      conversation.push({ role: 'user', content: toolResults });
      await this.persist(userId, 'user', toolResults);
    }

    onDelta('\n\n(Stopped after too many tool calls — try rephrasing.)');
  }

  // Deliberately bounded to the same RECENCY_WINDOW as the context sent to
  // Claude, not the full persisted thread — see devlog day 9. Pagination
  // over older messages is a later addition if that ever proves
  // insufficient, same call as pgvector retrieval.
  async getHistory(userId: string): Promise<ChatHistoryTurn[]> {
    const history = await this.loadRecentMessages(userId);
    return toHistoryTurns(history);
  }

  private async loadRecentMessages(userId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(RECENCY_WINDOW);

    return rows.reverse().map((row) => ({
      role: row.role,
      content: JSON.parse(decryptField(row.content)) as Anthropic.MessageParam['content'],
    }));
  }

  private async persist(userId: string, role: Role, content: unknown): Promise<void> {
    await this.db.insert(messages).values({
      userId,
      role,
      content: encryptField(JSON.stringify(content)),
    });
  }
}
