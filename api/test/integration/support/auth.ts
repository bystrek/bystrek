import { createLocalAccountIssuer } from '@better-auth/core/db';
import { hashPassword } from 'better-auth/crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createAuth } from '../../../src/auth/auth.config';
import * as schema from '../../../src/db/schema';
import { accounts, users } from '../../../src/db/schema';

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Inserts a user with a real password-backed account and signs in, the same
 * way a real client would — so tests exercise the actual auth path (hashing,
 * session creation, bearer-token issuance) rather than faking a session.
 */
export async function signUpTestUser(
  db: Db,
  params: {
    email: string;
    name: string;
    role?: 'user' | 'admin';
    password?: string;
  },
) {
  const password = params.password ?? 'correct horse battery staple';

  const [user] = await db
    .insert(users)
    .values({
      email: params.email,
      name: params.name,
      status: 'active',
      emailVerified: true,
      role: params.role ?? 'user',
    })
    .returning();

  await db.insert(accounts).values({
    userId: user.id,
    issuer: createLocalAccountIssuer('credential'),
    providerId: 'credential',
    accountId: user.id,
    password: await hashPassword(password),
  });

  const auth = createAuth(db);
  const res = await auth.api.signInEmail({
    body: { email: params.email, password },
    asResponse: true,
  });

  const token = res.headers.get('set-auth-token');
  if (!token) {
    throw new Error('sign-in did not return a bearer token');
  }

  return { user, token };
}
