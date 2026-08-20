import { describe, expect, it, mock } from 'bun:test';
import type Anthropic from '@anthropic-ai/sdk';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ANTHROPIC } from '../../src/chat/anthropic.provider';
import { CHAT_TOOLS, type ChatTool } from '../../src/chat/chat.tools';
import { decryptField } from '../../src/crypto/field-encryption';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { households, messages } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

// Never hit the real Anthropic API in tests — this fake stands in for
// `client.messages.stream()`, replaying one fixed Message per call.
function fakeAnthropic(responses: Anthropic.Message[]): Anthropic {
  let call = 0;
  return {
    messages: {
      stream: () => {
        const response = responses[call++];
        return {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            if (event === 'text') {
              for (const block of response.content) {
                if (block.type === 'text') listener(block.text, block.text);
              }
            }
          },
          finalMessage: () => Promise.resolve(response),
        };
      },
    },
  } as unknown as Anthropic;
}

function fakeMessage(
  content: Anthropic.Message['content'],
  stopReason: Anthropic.Message['stop_reason'],
): Anthropic.Message {
  return {
    id: 'msg_test',
    container: null,
    content,
    model: 'claude-sonnet-5',
    role: 'assistant',
    stop_reason: stopReason,
    stop_details: null,
    stop_sequence: null,
    type: 'message',
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      cache_creation: null,
    } as Anthropic.Usage,
  };
}

describe('POST /chat (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/chat')
        .send({ message: 'hi' });

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('streams the reply and persists both turns, encrypted at rest', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { user, token } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'me@example.com',
        name: 'Me',
      });

      const anthropic = fakeAnthropic([
        fakeMessage(
          [{ type: 'text', text: 'Hello there', citations: [] }],
          'end_turn',
        ),
      ]);

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(ANTHROPIC)
        .useValue(anthropic)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'what is my week look like?' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('Hello there');

      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.userId, user.id))
        .orderBy(asc(messages.createdAt));

      expect(rows).toHaveLength(2);
      expect(rows[0].role).toBe('user');
      expect(rows[0].visibility).toBe('private');
      expect(rows[0].content).not.toContain('what is my week');
      expect(JSON.parse(decryptField(rows[0].content))).toBe(
        'what is my week look like?',
      );
      expect(rows[1].role).toBe('assistant');
      expect(JSON.parse(decryptField(rows[1].content))).toEqual([
        { type: 'text', text: 'Hello there', citations: [] },
      ]);

      await app.close();
    });
  });

  it('runs a registered tool and persists the full tool_use/tool_result sequence', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { user, token } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'me@example.com',
        name: 'Me',
      });

      const anthropic = fakeAnthropic([
        fakeMessage(
          [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'test_tool',
              input: { foo: 'bar' },
            },
          ],
          'tool_use',
        ),
        fakeMessage(
          [{ type: 'text', text: 'done', citations: [] }],
          'end_turn',
        ),
      ]);

      const handler = mock((input: unknown) =>
        Promise.resolve({ ok: true, input }),
      );
      const tools: ChatTool[] = [
        {
          definition: {
            name: 'test_tool',
            description: 'a fake tool for tests',
            input_schema: { type: 'object' },
          },
          handler,
        },
      ];

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(ANTHROPIC)
        .useValue(anthropic)
        .overrideProvider(CHAT_TOOLS)
        .useValue(tools)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'run the tool' });

      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ foo: 'bar' });

      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.userId, user.id))
        .orderBy(asc(messages.createdAt));

      expect(rows.map((r) => r.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);

      const toolResultContent = JSON.parse(
        decryptField(rows[2].content),
      ) as Array<{
        type: string;
        tool_use_id: string;
        content: string;
      }>;
      expect(toolResultContent[0].type).toBe('tool_result');
      expect(toolResultContent[0].tool_use_id).toBe('toolu_1');
      expect(JSON.parse(toolResultContent[0].content)).toEqual({
        ok: true,
        input: { foo: 'bar' },
      });

      await app.close();
    });
  });

  it('rejects an empty message', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { token } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'me@example.com',
        name: 'Me',
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: '   ' });

      expect(res.status).toBe(400);

      await app.close();
    });
  });
});
