import { describe, expect, it, mock } from 'bun:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminGuard, AuthGuard } from './auth.guard';
import type { Auth } from './auth.config';

function fakeContext(): ExecutionContext {
  const request = { headers: {} };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function fakeAuth(session: unknown): Auth {
  return { api: { getSession: mock(() => Promise.resolve(session)) } } as unknown as Auth;
}

describe('AuthGuard', () => {
  it('rejects when there is no session', async () => {
    const guard = new AuthGuard(fakeAuth(null));
    await expect(guard.canActivate(fakeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('allows through and attaches the session when one exists', async () => {
    const session = { user: { id: '1', role: 'user' } };
    const guard = new AuthGuard(fakeAuth(session));
    const context = fakeContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest().session).toBe(session);
  });
});

describe('AdminGuard', () => {
  it('rejects a valid session without the admin role', async () => {
    const session = { user: { id: '1', role: 'user' } };
    const guard = new AdminGuard(fakeAuth(session));
    await expect(guard.canActivate(fakeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('allows an admin session through', async () => {
    const session = { user: { id: '1', role: 'admin' } };
    const guard = new AdminGuard(fakeAuth(session));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
  });
});
