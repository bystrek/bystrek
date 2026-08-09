import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { households, users } from '../../src/db/schema';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

describe('households/users data model (integration)', () => {
  it('creates a household and an invited member under it', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ householdId: household.id, email: 'member@example.com' })
        .returning();

      expect(user.status).toBe('invited');
      expect(user.emailVerified).toBe(false);
      expect(user.householdId).toBe(household.id);
    });
  });

  it('rejects a duplicate email', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();

      await tx
        .insert(users)
        .values({ householdId: household.id, email: 'dup@example.com' });

      let threw = false;
      try {
        await tx
          .insert(users)
          .values({ householdId: household.id, email: 'dup@example.com' });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  it('rejects a user referencing a nonexistent household', async () => {
    await withRollback(testDb, async (tx) => {
      let threw = false;
      try {
        await tx.insert(users).values({
          householdId: '00000000-0000-0000-0000-000000000000',
          email: 'orphan@example.com',
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  it('cascades user deletion when the household is deleted', async () => {
    await withRollback(testDb, async (tx) => {
      const [household] = await tx
        .insert(households)
        .values({ name: 'Test Household' })
        .returning();

      await tx
        .insert(users)
        .values({ householdId: household.id, email: 'cascade@example.com' });

      await tx.delete(households).where(eq(households.id, household.id));

      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.email, 'cascade@example.com'));
      expect(rows).toHaveLength(0);
    });
  });
});
