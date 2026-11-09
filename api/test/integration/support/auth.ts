import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createAuth } from '../../../src/auth/auth.config';
import * as schema from '../../../src/db/schema';
import { users } from '../../../src/db/schema';

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Inserts a user with a real better-auth session and returns its bearer
 * token, so tests go through the actual session lookup rather than faking
 * one. `pocket-id-sign-in.integration.spec.ts` covers how sessions are made.
 */
export async function signUpTestUser(
  db: Db,
  params: { email: string; name: string; role?: 'user' | 'admin' },
) {
  const [user] = await db
    .insert(users)
    .values({
      email: params.email,
      name: params.name,
      emailVerified: true,
      role: params.role ?? 'user',
    })
    .returning();

  const { internalAdapter } = await createAuth(db).$context;
  const session = await internalAdapter.createSession(user.id);
  return { user, token: session.token };
}
