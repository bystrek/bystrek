import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { users } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('GET /users (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/users');

      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('returns all users for an authenticated user', async () => {
    await withRollback(testDb, async (tx) => {
      await tx.insert(users).values({
        email: 'member@example.com',
        name: 'Test Member',
        status: 'active',
      });

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
        .get('/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toContainEqual(
        expect.objectContaining({ name: 'Test Member', status: 'active' }),
      );

      await app.close();
    });
  });
});
