import { beforeEach, describe, expect, it } from 'bun:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { bearer } from 'better-auth/plugins';
import type { Request } from 'express';
import { ApiTokenGuard } from './api-token.guard';
import { API_TOKEN_PREFIX, apiTokens } from './api-tokens';
import type { Auth } from './auth.config';
import { AuthGuard } from './auth.guard';

// A real better-auth with the same token plugin as the app, on an in-memory
// store, so the guards run against real hashing and lookups.
function createTestAuth() {
  return betterAuth({
    secret: 'test-secret-at-least-32-characters-long',
    baseURL: 'http://localhost:3000',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], apiToken: [] }),
    plugins: [bearer(), apiTokens()],
    // Invalid tokens are the point of these tests; better-auth logs each as an error.
    logger: { disabled: true },
  });
}

function contextWith(authorization?: string) {
  const request = { headers: authorization ? { authorization } : {} } as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('ApiTokenGuard', () => {
  let auth: ReturnType<typeof createTestAuth>;
  let guard: ApiTokenGuard;
  let userId: string;
  let sessionHeaders: Headers;

  beforeEach(async () => {
    auth = createTestAuth();
    guard = new ApiTokenGuard(auth as unknown as Auth);
    const { internalAdapter } = await auth.$context;
    const user = await internalAdapter.createUser({ email: 'a@example.com', name: 'A' });
    const session = await internalAdapter.createSession(user.id);
    userId = user.id;
    sessionHeaders = new Headers({ authorization: `Bearer ${session.token}` });
  });

  const createToken = () =>
    auth.api.createApiKey({ body: { name: 'Health' }, headers: sessionHeaders });

  it('accepts a valid token and attaches its owner', async () => {
    const { key } = await createToken();
    expect(key.startsWith(API_TOKEN_PREFIX)).toBe(true);
    const { request, context } = contextWith(`Bearer ${key}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.apiTokenUserId).toBe(userId);
  });

  it('rejects a revoked token', async () => {
    const { id, key } = await createToken();
    await auth.api.deleteApiKey({ body: { keyId: id }, headers: sessionHeaders });

    await expect(guard.canActivate(contextWith(`Bearer ${key}`).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown token', async () => {
    await createToken();
    const unknown = `${API_TOKEN_PREFIX}${'x'.repeat(64)}`;

    await expect(guard.canActivate(contextWith(`Bearer ${unknown}`).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request without a bearer token', async () => {
    const { key } = await createToken();

    await expect(guard.canActivate(contextWith().context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(contextWith(key).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a session token', async () => {
    await expect(
      guard.canActivate(contextWith(sessionHeaders.get('authorization')!).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('is the only guard a token gets through: AuthGuard rejects it', async () => {
    const { key } = await createToken();
    const sessionGuard = new AuthGuard(auth as unknown as Auth);

    await expect(sessionGuard.canActivate(contextWith(`Bearer ${key}`).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
