import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('/calendar/events (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get(
        '/calendar/events?start=2026-09-01T00:00:00&end=2026-09-02T00:00:00',
      );
      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('rejects a list request missing start/end', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/calendar/events')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('rejects an unparseable start/end', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/calendar/events?start=not-a-date&end=also-not-a-date')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('reports "not configured" (400) when the user has no calendar connected', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();
      const auth = { Authorization: `Bearer ${token}` };

      const listRes = await request(app.getHttpServer())
        .get('/calendar/events?start=2026-09-01T00:00:00&end=2026-09-02T00:00:00')
        .set(auth);
      expect(listRes.status).toBe(400);

      await app.close();
    });
  });
});
