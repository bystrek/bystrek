import { describe, expect, it } from 'bun:test';
import { Test } from '@nestjs/testing';
import { toNodeHandler } from 'better-auth/node';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import express from 'express';
import request from 'supertest';
import { AUTH } from '../../src/auth/auth.provider';
import type { Auth } from '../../src/auth/auth.config';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { households } from '../../src/db/schema';
import type * as schema from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

// better-auth needs the raw request body, so /api/auth is mounted the same
// way main.ts mounts it (ahead of Nest's own JSON body parser).
async function createApp(tx: Tx) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(tx)
    .compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  const auth = app.get<Auth>(AUTH);
  app.use('/api/auth', toNodeHandler(auth));
  app.use(express.json());
  await app.init();
  return app;
}

describe('profile fields via better-auth (integration)', () => {
  it('round-trips firstName/lastName/image through update-user and get-session', async () => {
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

      const app = await createApp(tx);

      const image = 'data:image/jpeg;base64,/9j/aaaa';
      const updateRes = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Michał Bobrowicz',
          firstName: 'Michał',
          lastName: 'Bobrowicz',
          image,
        });

      expect(updateRes.status).toBe(200);

      const sessionRes = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Authorization', `Bearer ${token}`);

      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.user).toMatchObject({
        name: 'Michał Bobrowicz',
        firstName: 'Michał',
        lastName: 'Bobrowicz',
        image,
      });

      await app.close();
    });
  });

  it('401s update-user without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);

      const res = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .send({ firstName: 'Nope' });

      expect(res.status).toBe(401);

      await app.close();
    });
  });
});
