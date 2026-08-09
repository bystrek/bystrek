import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { households, users } from '../../src/db/schema';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('GET /household (integration)', () => {
  it('returns the household and its members', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();

      await tx.insert(users).values({
        householdId: household.id,
        email: 'member@example.com',
        name: 'Test Member',
        status: 'active',
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/household');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: 'Test Household',
        members: [{ name: 'Test Member', status: 'active' }],
      });

      await app.close();
    });
  });

  it('returns the oldest household when more than one exists', async () => {
    await withRollback(testDb, async (tx) => {
      await tx.insert(households).values({ name: 'Newer Household' });
      const [older] = await tx
        .insert(households)
        .values({
          name: 'Older Household',
          createdAt: new Date(Date.now() - 60_000),
        })
        .returning();
      await tx.insert(households).values({ name: 'Newest Household' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/household');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: older.name });

      await app.close();
    });
  });

  it('404s when no household exists', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/household');

      expect(res.status).toBe(404);

      await app.close();
    });
  });
});
