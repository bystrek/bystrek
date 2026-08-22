import { describe, expect, it, mock } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { households, users } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

// sendResetPassword calls out to Resend — never hit a real third party in
// tests. mock.module intercepts the import before auth.config.ts loads it.
const sendEmailMock = mock();
mock.module('../../src/auth/resend', () => ({ sendEmail: sendEmailMock }));

describe('household admin endpoints (integration)', () => {
  it('rejects invite/ban/unban for a non-admin member', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { token } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'member@example.com',
        name: 'Member',
        role: 'user',
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/household/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', name: 'New Person' });

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('lets an admin invite a new member', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { token } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/household/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@example.com', name: 'New Person' });

      expect(res.status).toBe(201);

      const [invited] = await tx.select().from(users).where(eq(users.email, 'new@example.com'));
      expect(invited).toBeDefined();
      expect(invited.status).toBe('invited');
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0]).toBe('new@example.com');

      await app.close();
    });
  });

  it('lets an admin ban and unban a member', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();
      const { token: adminToken } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
      });
      const { user: member } = await signUpTestUser(tx, {
        householdId: household.id,
        email: 'member@example.com',
        name: 'Member',
        role: 'user',
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const banRes = await request(app.getHttpServer())
        .post(`/household/members/${member.id}/ban`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(banRes.status).toBe(201);

      const [bannedRow] = await tx.select().from(users).where(eq(users.id, member.id));
      expect(bannedRow.banned).toBe(true);

      const unbanRes = await request(app.getHttpServer())
        .post(`/household/members/${member.id}/unban`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unbanRes.status).toBe(201);

      const [unbannedRow] = await tx.select().from(users).where(eq(users.id, member.id));
      expect(unbannedRow.banned).toBe(false);

      await app.close();
    });
  });
});
