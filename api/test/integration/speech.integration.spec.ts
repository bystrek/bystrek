import { describe, expect, it, mock } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import type * as schema from '../../src/db/schema';
import { MAX_AUDIO_BYTES } from '../../src/speech/speech.controller';
import { SPEECH_TO_TEXT } from '../../src/speech/speech.model';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

async function appWith(tx: PostgresJsDatabase<typeof schema>, transcribe = mock()) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(tx)
    .overrideProvider(SPEECH_TO_TEXT)
    .useValue({ transcribe })
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('/speech/transcribe (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await appWith(tx);

      const res = await request(app.getHttpServer())
        .post('/speech/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from([1, 2, 3]));
      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('hands the raw recording to the transcriber and returns its text', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });
      const transcribe = mock(() => Promise.resolve('next meeting'));
      const app = await appWith(tx, transcribe);

      const res = await request(app.getHttpServer())
        .post('/speech/transcribe')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'audio/webm;codecs=opus')
        .send(Buffer.from([1, 2, 3]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: 'next meeting' });
      expect(transcribe).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), 'audio/webm;codecs=opus');

      await app.close();
    });
  });

  it('rejects a non-audio body and an oversized recording', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });
      const app = await appWith(tx);

      const json = await request(app.getHttpServer())
        .post('/speech/transcribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'next meeting' });
      expect(json.status).toBe(415);

      const tooBig = await request(app.getHttpServer())
        .post('/speech/transcribe')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'audio/webm')
        .send(Buffer.alloc(MAX_AUDIO_BYTES + 1));
      expect(tooBig.status).toBe(413);

      await app.close();
    });
  });
});
