import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { calendarCredentials } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('/calendar/credentials (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer()).get('/calendar/credentials');
      expect(res.status).toBe(401);

      await app.close();
    });
  });

  it('reports not configured, then round-trips set/get/delete without ever exposing the password', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();
      const auth = { Authorization: `Bearer ${token}` };

      const before = await request(app.getHttpServer()).get('/calendar/credentials').set(auth);
      expect(before.body).toEqual({
        configured: false,
        caldavUrl: null,
        username: null,
        calendarUrl: null,
        calendarDisplayName: null,
      });

      const setRes = await request(app.getHttpServer())
        .put('/calendar/credentials')
        .set(auth)
        .send({
          caldavUrl: 'https://sync.infomaniak.com',
          username: 'me@ik.me',
          password: 'super-secret-app-password',
          calendarUrl: 'https://sync.infomaniak.com/calendars/me/personal/',
          calendarDisplayName: 'Personal',
        });
      expect(setRes.status).toBe(200);

      const after = await request(app.getHttpServer()).get('/calendar/credentials').set(auth);
      expect(after.body).toEqual({
        configured: true,
        caldavUrl: 'https://sync.infomaniak.com',
        username: 'me@ik.me',
        calendarUrl: 'https://sync.infomaniak.com/calendars/me/personal/',
        calendarDisplayName: 'Personal',
      });
      expect(JSON.stringify(after.body)).not.toContain('super-secret-app-password');

      const [row] = await tx.select().from(calendarCredentials);
      expect(row.password).not.toContain('super-secret-app-password');

      const deleteRes = await request(app.getHttpServer())
        .delete('/calendar/credentials')
        .set(auth);
      expect(deleteRes.status).toBe(200);

      const afterDelete = await request(app.getHttpServer()).get('/calendar/credentials').set(auth);
      expect((afterDelete.body as { configured: boolean }).configured).toBe(false);

      await app.close();
    });
  });

  it('keeps the existing password when the update omits it', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();
      const auth = { Authorization: `Bearer ${token}` };

      await request(app.getHttpServer()).put('/calendar/credentials').set(auth).send({
        caldavUrl: 'https://sync.infomaniak.com',
        username: 'me@ik.me',
        password: 'original-password',
      });
      const [before] = await tx.select().from(calendarCredentials);

      const updateRes = await request(app.getHttpServer())
        .put('/calendar/credentials')
        .set(auth)
        .send({ caldavUrl: 'https://sync.infomaniak.com', username: 'me@ik.me', password: '' });
      expect(updateRes.status).toBe(200);

      const [after] = await tx.select().from(calendarCredentials);
      expect(after.password).toBe(before.password);

      await app.close();
    });
  });

  it('rejects setting credentials for the first time with no password', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .put('/calendar/credentials')
        .set('Authorization', `Bearer ${token}`)
        .send({ caldavUrl: 'https://sync.infomaniak.com', username: 'me@ik.me', password: '' });

      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('rejects a non-https caldavUrl', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .put('/calendar/credentials')
        .set('Authorization', `Bearer ${token}`)
        .send({ caldavUrl: 'http://sync.infomaniak.com', username: 'me', password: 'secret' });

      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('rejects a caldavUrl pointing at a private/internal host', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .put('/calendar/credentials')
        .set('Authorization', `Bearer ${token}`)
        .send({ caldavUrl: 'https://169.254.169.254/', username: 'me', password: 'secret' });

      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('preview-calendars rejects a non-https URL before attempting to connect', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, { email: 'me@example.com', name: 'Me' });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(tx)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/calendar/credentials/preview-calendars')
        .set('Authorization', `Bearer ${token}`)
        .send({ caldavUrl: 'http://sync.infomaniak.com', username: 'me', password: 'secret' });

      expect(res.status).toBe(400);

      await app.close();
    });
  });
});
