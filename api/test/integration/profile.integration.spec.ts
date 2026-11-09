import { describe, expect, it } from 'bun:test';
import request from 'supertest';
import { createApp } from './support/app';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';
describe('profile fields via better-auth (integration)', () => {
  it('round-trips firstName/lastName/image through update-user and get-session', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, {
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

  it('rejects an oversized image on update-user', async () => {
    await withRollback(testDb, async (tx) => {
      const { token } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });

      const app = await createApp(tx);

      const oversizedImage = `data:image/jpeg;base64,${'a'.repeat(300_000)}`;
      const res = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Authorization', `Bearer ${token}`)
        .send({ image: oversizedImage });

      expect(res.status).toBe(413);

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
