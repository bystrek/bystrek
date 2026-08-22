import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../../src/db/schema';

type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

class RollbackSignal extends Error {}

/**
 * Runs `fn` inside a Postgres transaction and always rolls it back afterward,
 * so integration tests can hit a real DB without leaving state behind or
 * needing to reset/reseed between tests.
 */
export async function withRollback<T>(
  db: PostgresJsDatabase<typeof schema>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new RollbackSignal();
    });
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
  return result!;
}
