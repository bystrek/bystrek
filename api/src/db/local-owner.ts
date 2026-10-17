import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { hashPassword } from 'better-auth/crypto';
import * as schema from './schema';
import { accounts, users } from './schema';

type Database = PostgresJsDatabase<typeof schema>;

export async function localOwnerNeedsPassword(db: Database, email: string): Promise<boolean> {
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  if (owner && (owner.status !== 'active' || owner.role !== 'admin')) {
    throw new Error('Existing local owner is not an active admin');
  }
  if (!owner) return true;
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, owner.id), eq(accounts.providerId, 'credential')));
  return !account?.password;
}

export async function seedLocalOwner(
  db: Database,
  email: string,
  name: string,
  password: string,
): Promise<void> {
  if (password.length < 8 || password.length > 128) {
    throw new Error('Local password must be 8-128 characters');
  }
  const hashedPassword = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [owner] = await tx.select().from(users).where(eq(users.email, email));
    if (owner && (owner.status !== 'active' || owner.role !== 'admin')) {
      throw new Error('Existing local owner is not an active admin');
    }
    const [account] = owner
      ? await tx
          .select({ id: accounts.id, password: accounts.password })
          .from(accounts)
          .where(and(eq(accounts.userId, owner.id), eq(accounts.providerId, 'credential')))
      : [];
    if (account?.password) return;
    const userId = owner
      ? owner.id
      : (
          await tx
            .insert(users)
            .values({ email, name, emailVerified: true, status: 'active', role: 'admin' })
            .returning({ id: users.id })
        )[0].id;
    if (account) {
      await tx
        .update(accounts)
        .set({ password: hashedPassword })
        .where(eq(accounts.id, account.id));
    } else {
      await tx.insert(accounts).values({
        userId,
        issuer: 'local:credential',
        providerId: 'credential',
        accountId: userId,
        password: hashedPassword,
      });
    }
  });
}
