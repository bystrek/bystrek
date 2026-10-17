import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { users } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('/calendar/events (integration)', () => {
  it('returns the signed-in account timezone without calendar credentials', async () => {
    await withRollback(testDb, async (tx) => {
      const { token, user } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });
      await tx.update(users).set({ timezone: 'Pacific/Kiritimati' }).where(eq(users.id, user.id));

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const unauthorized = await request(app.getHttpServer()).get('/calendar/events/timezone');
      expect(unauthorized.status).toBe(401);
      const res = await request(app.getHttpServer())
        .get('/calendar/events/timezone')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ timezone: 'Pacific/Kiritimati' });

      await app.close();
    });
  });

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

  it('rejects a range where "end" is not after "start"', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/calendar/events?start=2026-09-02T00:00:00&end=2026-09-01T00:00:00')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain('must be after');

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

      const getRes = await request(app.getHttpServer()).get('/calendar/events/some-uid').set(auth);
      expect(getRes.status).toBe(400);

      await app.close();
    });
  });
});
