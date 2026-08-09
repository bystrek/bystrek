import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { subscriptions } from '../../src/db/schema';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('POST /push/subscribe (integration)', () => {
  it('stores a subscription in Postgres', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/push/subscribe')
        .send({
          endpoint: 'https://example.com/test-endpoint',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });

      const rows = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.endpoint, 'https://example.com/test-endpoint'));
      expect(rows).toHaveLength(1);
      expect(rows[0].p256dh).toBe('test-p256dh');

      await app.close();
    });
  });

  it('rejects an invalid subscription payload', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/push/subscribe')
        .send({ endpoint: 'https://example.com/missing-keys' });

      expect(res.status).toBe(400);

      const rows = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.endpoint, 'https://example.com/missing-keys'));
      expect(rows).toHaveLength(0);

      await app.close();
    });
  });
});
