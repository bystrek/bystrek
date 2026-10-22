import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { localOwnerNeedsPassword, seedLocalOwner } from '../../scripts/local-owner';
import { accounts, users } from '../../src/db/schema';
import { testDb } from './support/test-db';

const email = 'local-owner-test@example.invalid';

describe('local owner bootstrap', () => {
  it('creates a login once and preserves its password on later startups', async () => {
    try {
      expect(await localOwnerNeedsPassword(testDb, email)).toBe(true);
      await seedLocalOwner(testDb, email, 'Local Test', 'first-password');
      const [owner] = await testDb.select().from(users).where(eq(users.email, email));
      expect(owner).toMatchObject({ status: 'active', role: 'admin', emailVerified: true });
      const [account] = await testDb.select().from(accounts).where(eq(accounts.userId, owner.id));
      expect(await verifyPassword({ hash: account.password!, password: 'first-password' })).toBe(
        true,
      );
      expect(await localOwnerNeedsPassword(testDb, email)).toBe(false);

      await seedLocalOwner(testDb, email, 'Changed', 'different-password');
      const [unchanged] = await testDb.select().from(accounts).where(eq(accounts.userId, owner.id));
      expect(unchanged.password).toBe(account.password);
      expect(await testDb.select().from(users).where(eq(users.email, email))).toHaveLength(1);
    } finally {
      await testDb.delete(users).where(eq(users.email, email));
    }
  });

  it('adds a password to an existing owner without replacing their profile', async () => {
    await testDb
      .insert(users)
      .values({ email, name: 'Existing', status: 'active', role: 'admin', emailVerified: true });
    try {
      await seedLocalOwner(testDb, email, 'Changed', 'first-password');
      const [owner] = await testDb.select().from(users).where(eq(users.email, email));
      expect(owner.name).toBe('Existing');
      expect(await localOwnerNeedsPassword(testDb, email)).toBe(false);
    } finally {
      await testDb.delete(users).where(eq(users.email, email));
    }
  });

  it('does not turn an existing non-admin account into the local owner', async () => {
    await testDb.insert(users).values({ email, name: 'Invited', status: 'invited' });
    try {
      await expect(localOwnerNeedsPassword(testDb, email)).rejects.toThrow(
        'Existing local owner is not an active admin',
      );
      await expect(seedLocalOwner(testDb, email, 'Changed', 'first-password')).rejects.toThrow(
        'Existing local owner is not an active admin',
      );
    } finally {
      await testDb.delete(users).where(eq(users.email, email));
    }
  });
});
