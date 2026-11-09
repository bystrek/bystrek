import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { OIDC_ADMIN_GROUP } from '../../src/env';
import { accounts, users } from '../../src/db/schema';
import { createApp } from './support/app';
import { fakePocketId, PocketIdUser } from './support/fake-pocket-id';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

const UI_CALLBACK = 'http://localhost:4200/auth/callback';

const alice: PocketIdUser = {
  sub: 'pocket-id-alice',
  email: 'alice@example.com',
  name: 'Alice Liddell',
  given_name: 'Alice',
  family_name: 'Liddell',
  picture: 'https://auth.example/api/users/alice/profile-picture.png',
};

const pathOf = (location: string) => {
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
};

// A minimal cookie jar: the latest value per name, minus cookies being cleared.
function jar(...responses: request.Response[]): string {
  const cookies = new Map<string, string>();
  for (const res of responses) {
    for (const cookie of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair] = cookie.split(';');
      const name = pair.slice(0, pair.indexOf('='));
      if (pair.endsWith('=') || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, pair);
    }
  }
  return [...cookies.values()].join('; ');
}

/** Starts sign-in the way the UI does and returns Pocket ID's authorization URL. */
async function startSignIn(app: INestApplication, to = UI_CALLBACK) {
  const server = app.getHttpServer();
  const start = await request(server).get('/auth/sign-in').query({ to });
  expect(start.status).toBe(302);
  const begin = await request(server).get(pathOf(start.headers.location));
  expect(begin.status).toBe(302);
  return { authorizationUrl: begin.headers.location as string, begin };
}

/** The whole redirect chain, ending on the UI callback with `?ott=` or `?error=`. */
async function signInWithPocketId(app: INestApplication, user: PocketIdUser) {
  const server = app.getHttpServer();
  const { authorizationUrl, begin } = await startSignIn(app);
  const code = fakePocketId.authorize(authorizationUrl, user);
  const state = new URL(authorizationUrl).searchParams.get('state');

  const callback = await request(server)
    .get('/api/auth/callback/pocket-id')
    .query({ code, state })
    .set('Cookie', jar(begin));
  expect(callback.status).toBe(302);

  const handoff = await request(server)
    .get(pathOf(callback.headers.location))
    .set('Cookie', jar(begin, callback));
  expect(handoff.status).toBe(302);
  return { returnUrl: new URL(handoff.headers.location), handoff };
}

async function verify(app: INestApplication, ott: string | null) {
  return request(app.getHttpServer()).post('/api/auth/one-time-token/verify').send({ token: ott });
}

async function sessionUser(app: INestApplication, user: PocketIdUser) {
  const { returnUrl } = await signInWithPocketId(app, user);
  const verified = await verify(app, returnUrl.searchParams.get('ott'));
  const session = await request(app.getHttpServer())
    .get('/api/auth/get-session')
    .set('Authorization', `Bearer ${verified.headers['set-auth-token']}`);
  return session.body.user;
}

describe('Pocket ID sign-in (integration)', () => {
  it('creates a user on their first sign-in and hands the session to the UI once', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);

      const { returnUrl, handoff } = await signInWithPocketId(app, alice);
      expect(returnUrl.origin + returnUrl.pathname).toBe(UI_CALLBACK);
      // The handoff's cookie session is dropped; the bearer token takes over.
      expect(jar(handoff)).not.toContain('session_token');

      const ott = returnUrl.searchParams.get('ott');
      const verified = await verify(app, ott);
      expect(verified.status).toBe(200);
      const token = verified.headers['set-auth-token'];
      expect(token).toBeTruthy();

      const session = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Authorization', `Bearer ${token}`);
      expect(session.body.user).toMatchObject({
        email: alice.email,
        name: 'Alice Liddell',
        firstName: 'Alice',
        lastName: 'Liddell',
        image: alice.picture,
        role: 'user',
      });

      expect((await verify(app, ott)).status).toBe(400);

      await app.close();
    });
  });

  it("links an existing user's first sign-in to their row by email", async () => {
    await withRollback(testDb, async (tx) => {
      const [existing] = await tx
        .insert(users)
        .values({ email: alice.email, name: 'Alice (bystrek)', emailVerified: true })
        .returning();
      const app = await createApp(tx);

      const user = await sessionUser(app, alice);

      expect(user.id).toBe(existing.id);
      // Profile fields live in bystrek: linking doesn't overwrite them.
      expect(user.name).toBe('Alice (bystrek)');
      const linked = await tx.select().from(accounts).where(eq(accounts.userId, existing.id));
      expect(linked.map((a) => a.providerId)).toEqual(['pocket-id']);

      await app.close();
    });
  });

  it('gives the admin role to admin group members and follows group changes', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);

      expect((await sessionUser(app, { ...alice, groups: [OIDC_ADMIN_GROUP] })).role).toBe('admin');
      expect((await sessionUser(app, { ...alice, groups: ['family'] })).role).toBe('user');

      await app.close();
    });
  });

  it('sends Pocket ID errors back to the UI', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);
      const { authorizationUrl, begin } = await startSignIn(app);

      const callback = await request(app.getHttpServer())
        .get('/api/auth/callback/pocket-id')
        .query({
          error: 'access_denied',
          state: new URL(authorizationUrl).searchParams.get('state'),
        })
        .set('Cookie', jar(begin));

      expect(callback.status).toBe(302);
      const returnUrl = new URL(callback.headers.location);
      expect(returnUrl.origin + returnUrl.pathname).toBe(UI_CALLBACK);
      expect(returnUrl.searchParams.get('error')).toBe('access_denied');

      await app.close();
    });
  });

  it('refuses return URLs off the allow-list', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);
      const to = 'https://evil.example/auth/callback';

      for (const path of ['/auth/sign-in', '/auth/sign-in/pocket-id', '/auth/handoff']) {
        expect((await request(app.getHttpServer()).get(path).query({ to })).status).toBe(400);
      }

      await app.close();
    });
  });

  it('rejects email and password sign-in and password resets', async () => {
    await withRollback(testDb, async (tx) => {
      const app = await createApp(tx);
      const server = app.getHttpServer();

      const responses = await Promise.all([
        request(server)
          .post('/api/auth/sign-in/email')
          .send({ email: alice.email, password: 'correct horse battery staple' }),
        request(server)
          .post('/api/auth/request-password-reset')
          .send({ email: alice.email, redirectTo: UI_CALLBACK }),
        request(server)
          .post('/api/auth/reset-password')
          .send({ newPassword: 'correct horse battery staple', token: 'any' }),
      ]);

      for (const res of responses) {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.headers['set-auth-token']).toBeUndefined();
      }

      await app.close();
    });
  });
});
