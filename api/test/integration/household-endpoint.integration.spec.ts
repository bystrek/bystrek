import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { households, users } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('GET /household (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      await tx.insert(households).values({ name: 'Test Household' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/household');

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('returns the household and its members for an authenticated member', async () => {
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
        .get('/household')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Household');
      expect(res.body.members).toContainEqual(
        expect.objectContaining({ name: 'Test Member', status: 'active' }),
      );

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

      const { token } = await signUpTestUser(tx, {
        householdId: older.id,
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
        .get('/household')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: older.name });

      await app.close();
    });
  });

  // No "404 when no household exists" case: every authenticated user
  // belongs to a household by FK (users.household_id is NOT NULL), so an
  // authenticated request can no longer hit that branch — reaching it would
  // require a session, which requires a household to exist first. The
  // null-household check stays in HouseholdService as a defensive guard for
  // the method itself, but it's no longer reachable through this route.
});
