import { describe, expect, it } from 'bun:test';
import { Controller, Get, INestApplication, Module, Req, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { toNodeHandler } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import express from 'express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ApiTokenGuard } from '../../src/auth/api-token.guard';
import { AuthModule } from '../../src/auth/auth.module';
import { AUTH } from '../../src/auth/auth.provider';
import type { Auth } from '../../src/auth/auth.config';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import { apiTokens } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

// Stands in for the first route that opts in to tokens (the Health import, #167).
@Controller('token-only')
@UseGuards(ApiTokenGuard)
class TokenOnlyController {
  @Get()
  whoAmI(@Req() req: Request) {
    return { userId: req.apiTokenUserId };
  }
}

@Module({ imports: [AuthModule], controllers: [TokenOnlyController] })
class TokenOnlyModule {}

type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

async function createApp(tx: Tx): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, TokenOnlyModule] })
    .overrideProvider(DRIZZLE)
    .useValue(tx)
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.use('/api/auth', toNodeHandler(app.get<Auth>(AUTH)));
  app.use(express.json());
  await app.init();
  return app;
}

describe('personal API tokens (integration)', () => {
  it('creates, lists, uses and revokes a token', async () => {
    await withRollback(testDb, async (tx) => {
      const { user, token: session } = await signUpTestUser(tx, {
        email: 'me@example.com',
        name: 'Me',
      });
      const app = await createApp(tx);
      const http = request(app.getHttpServer());
      const asUser = { Authorization: `Bearer ${session}` };

      const created = await http
        .post('/api/auth/api-key/create')
        .set(asUser)
        .send({ name: 'Health Auto Export' });
      expect(created.status).toBe(200);
      const { id, key } = created.body as { id: string; key: string };

      // Only the hash is stored.
      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.id, id));
      expect(row.referenceId).toBe(user.id);
      expect(row.key).not.toBe(key);
      expect(row.key).not.toContain(key.slice(12));

      const listed = await http.get('/api/auth/api-key/list').set(asUser);
      expect(listed.status).toBe(200);
      expect((listed.body as { apiKeys: unknown[] }).apiKeys).toEqual([
        expect.objectContaining({ id, name: 'Health Auto Export', start: key.slice(0, 12) }),
      ]);
      expect(JSON.stringify(listed.body)).not.toContain(key);

      const asToken = { Authorization: `Bearer ${key}` };
      const used = await http.get('/token-only').set(asToken);
      expect(used.status).toBe(200);
      expect(used.body).toEqual({ userId: user.id });

      // Routes that didn't opt in still want a session.
      expect((await http.get('/users').set(asToken)).status).toBe(401);
      expect((await http.get('/api/auth/api-key/list').set(asToken)).status).toBe(401);
      // And a session isn't a token.
      expect((await http.get('/token-only').set(asUser)).status).toBe(401);

      const revoked = await http.post('/api/auth/api-key/delete').set(asUser).send({ keyId: id });
      expect(revoked.status).toBe(200);
      expect((await http.get('/token-only').set(asToken)).status).toBe(401);

      await app.close();
    });
  });

  it("can't revoke another user's token", async () => {
    await withRollback(testDb, async (tx) => {
      const owner = await signUpTestUser(tx, { email: 'owner@example.com', name: 'Owner' });
      const other = await signUpTestUser(tx, { email: 'other@example.com', name: 'Other' });
      const app = await createApp(tx);
      const http = request(app.getHttpServer());

      const { id, key } = (
        await http
          .post('/api/auth/api-key/create')
          .set({ Authorization: `Bearer ${owner.token}` })
          .send({ name: 'Mine' })
      ).body as { id: string; key: string };

      const revoked = await http
        .post('/api/auth/api-key/delete')
        .set({ Authorization: `Bearer ${other.token}` })
        .send({ keyId: id });
      expect(revoked.status).not.toBe(200);
      expect((await http.get('/token-only').set({ Authorization: `Bearer ${key}` })).status).toBe(
        200,
      );

      await app.close();
    });
  });
});
