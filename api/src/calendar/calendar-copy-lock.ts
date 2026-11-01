import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// First key of the two-key advisory lock, so these locks can't collide with any other use.
const CALENDAR_COPY_LOCK = 0xca1;

// Holds the user's calendar copy lock until `tx` ends. Every sync step and every change to
// the credentials behind the copy takes it, so one sync runs per user, also across API
// replicas. Postgres releases it if the connection dies, so a crashed sync can't keep it.
export async function lockCalendarCopy(tx: Tx, userId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${CALENDAR_COPY_LOCK}::int, hashtext(${userId}::text))`,
  );
}
