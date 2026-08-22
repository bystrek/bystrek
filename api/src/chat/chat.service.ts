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
const SYSTEM_PROMPT =
  'You are the personal assistant built into bystrek, a household data platform. Be direct and concise.';

type Role = 'user' | 'assistant';

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
        system: SYSTEM_PROMPT,
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
          ? await tool.handler(block.input)
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
