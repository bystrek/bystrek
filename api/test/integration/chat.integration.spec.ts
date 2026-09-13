import { describe, expect, it, mock } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  CHAT_MODEL,
  type ChatCompletion,
  type ChatModel,
  type ChatToolCall,
} from '../../src/chat/chat.model';
import { MAX_TOOL_ITERATIONS } from '../../src/chat/chat.service';
import { CHAT_TOOLS, type ChatTool } from '../../src/chat/chat.tools';
import { decryptField, encryptField } from '../../src/crypto/field-encryption';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { messages } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

// Never hit the real model in tests — this fake replays one completion per call.
function fakeModel(responses: ChatCompletion[]): ChatModel {
  let call = 0;
  return {
    complete: (_, __, onDelta) => {
      const response = responses[call++];
      if (response.message.content) onDelta(response.message.content);
      return Promise.resolve(response);
    },
  };
}

function fakeMessage(content: string, toolCalls?: ChatToolCall[]): ChatCompletion {
  return {
    message: {
      role: 'assistant',
      content,
      ...(toolCalls ? { toolCalls } : {}),
    },
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

      const res = await request(app.getHttpServer()).post('/chat').send({ message: 'hi' });

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('streams the reply and persists both turns, encrypted at rest', async () => {
    await withRollback(testDb, async (tx) => {
      const { user, token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });

      const model = fakeModel([fakeMessage('Hello there')]);

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(CHAT_MODEL)
        .useValue(model)
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
      expect(res.text).toContain(
        JSON.stringify({
          done: true,
          toolCalls: [],
        }),
      );

      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.userId, user.id))
        .orderBy(asc(messages.createdAt));

      expect(rows).toHaveLength(2);
      expect(rows[0].role).toBe('user');
      expect(rows[0].visibility).toBe('private');
      expect(rows[0].content).not.toContain('what is my week');
      expect(JSON.parse(decryptField(rows[0].content))).toEqual({
        role: 'user',
        content: 'what is my week look like?',
      });
      expect(rows[1].role).toBe('assistant');
      expect(JSON.parse(decryptField(rows[1].content))).toEqual({
        role: 'assistant',
        content: 'Hello there',
      });

      await app.close();
    });
  });

  it('runs a registered tool and persists the full tool_use/tool_result sequence', async () => {
    await withRollback(testDb, async (tx) => {
      const { user, token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });

      const model = fakeModel([
        fakeMessage('', [{ name: 'test_tool', arguments: { foo: 'bar' } }]),
        fakeMessage('done'),
      ]);

      const handler = mock((input: unknown) => Promise.resolve({ ok: true, input }));
      const tools: ChatTool[] = [
        {
          definition: {
            name: 'test_tool',
            description: 'a fake tool for tests',
            inputSchema: { type: 'object' },
          },
          handler,
        },
      ];

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(CHAT_MODEL)
        .useValue(model)
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

      expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

      const toolResultContent = JSON.parse(decryptField(rows[2].content)) as {
        role: string;
        content: string;
      };
      expect(toolResultContent.role).toBe('tool');
      expect(toolResultContent.toolName).toBe('test_tool');
      expect(JSON.parse(toolResultContent.content)).toEqual({
        ok: true,
        input: { foo: 'bar' },
      });

      await app.close();
    });
  });

  it('rejects an empty message', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, {
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

  it('stops after MAX_TOOL_ITERATIONS instead of looping forever', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });

      // A tool that always asks for another tool call — the model never
      // reaches end_turn on its own, so this only terminates if the loop's
      // own cap does.
      const alwaysToolUse = Array.from({ length: MAX_TOOL_ITERATIONS }, () =>
        fakeMessage('', [{ name: 'test_tool', arguments: {} }]),
      );
      const model = fakeModel(alwaysToolUse);
      const handler = mock(() => Promise.resolve({ ok: true }));
      const tools: ChatTool[] = [
        {
          definition: {
            name: 'test_tool',
            description: 'a fake tool that always triggers another call',
            inputSchema: { type: 'object' },
          },
          handler,
        },
      ];

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(CHAT_MODEL)
        .useValue(model)
        .overrideProvider(CHAT_TOOLS)
        .useValue(tools)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'go' });

      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
      expect(res.text).toContain('Stopped after too many tool calls');

      await app.close();
    });
  });
});

describe('GET /chat/history (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/chat/history');

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('returns persisted turns collapsed to plain text, dropping pure tool turns', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });

      const model = fakeModel([
        fakeMessage('', [{ name: 'test_tool', arguments: {} }]),
        fakeMessage('done'),
      ]);
      const tools: ChatTool[] = [
        {
          definition: { name: 'test_tool', description: 'a fake tool', inputSchema: {} },
          handler: () => Promise.resolve({ ok: true }),
        },
      ];

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .overrideProvider(CHAT_MODEL)
        .useValue(model)
        .overrideProvider(CHAT_TOOLS)
        .useValue(tools)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer())
        .post('/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'run the tool' });

      const res = await request(app.getHttpServer())
        .get('/chat/history')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { role: 'user', text: 'run the tool' },
        { role: 'assistant', text: 'done' },
      ]);

      await app.close();
    });
  });
});

describe('DELETE /chat/history (integration)', () => {
  it('clears only the authenticated user history', async () => {
    await withRollback(testDb, async (tx) => {
      const { user, token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });
      const { user: otherUser } = await signUpTestUser(tx, {
        email: 'other@example.com',
        name: 'Other',
      });
      await tx.insert(messages).values([
        {
          userId: user.id,
          role: 'user',
          content: encryptField(JSON.stringify({ role: 'user', content: 'remove me' })),
          contentFormat: 'ollama',
        },
        {
          userId: otherUser.id,
          role: 'user',
          content: encryptField(JSON.stringify({ role: 'user', content: 'keep me' })),
          contentFormat: 'ollama',
        },
      ]);

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .delete('/chat/history')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(await tx.select().from(messages).where(eq(messages.userId, user.id))).toEqual([]);
      expect(
        await tx.select().from(messages).where(eq(messages.userId, otherUser.id)),
      ).toHaveLength(1);

      await app.close();
    });
  });
});
