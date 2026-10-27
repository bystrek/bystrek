import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { baselineMigrations } from '../../scripts/baseline-migrations';

const SQUASHED = `${__dirname}/../../drizzle`;
// The old chain through 0012, which is where production stopped.
const PRE_SQUASH = `${__dirname}/fixtures/pre-squash-drizzle`;

const admin = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const databases: string[] = [];

/** Creates an empty throwaway database and returns a client for it. */
async function scratchDatabase(): Promise<postgres.Sql> {
  const name = `baseline_test_${crypto.randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`create database "${name}"`);
  databases.push(name);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  return postgres(url.toString(), { max: 1, onnotice: () => {} });
}

async function migrateWith(sql: postgres.Sql, migrationsFolder: string) {
  await migrate(drizzle(sql), { migrationsFolder });
}

/**
 * Everything in `public` that a schema-only dump would describe, minus
 * column order (the old chain added columns later than a fresh create).
 */
async function describeSchema(sql: postgres.Sql) {
  const columns = await sql`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length
    from information_schema.columns where table_schema = 'public'
    order by table_name, column_name`;
  const constraints = await sql`
    select c.conrelid::regclass::text as table_name, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
    order by 1, 2`;
  const indexes = await sql`
    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
    order by 1, 2`;
  const enums = await sql`
    select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname order by 1`;
  const sequences = await sql`
    select sequencename, data_type from pg_sequences where schemaname = 'public' order by 1`;
  return [columns, constraints, indexes, enums, sequences].map((rows) => [...rows]);
}

async function history(sql: postgres.Sql) {
  return [...(await sql`select hash, created_at from drizzle.__drizzle_migrations order by id`)];
}

describe('baselineMigrations', () => {
  let fresh: postgres.Sql;
  let freshSchema: Awaited<ReturnType<typeof describeSchema>>;

  beforeAll(async () => {
    fresh = await scratchDatabase();
    await migrateWith(fresh, SQUASHED);
    freshSchema = await describeSchema(fresh);
  });

  afterAll(async () => {
    await fresh.end();
    for (const name of databases) {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
    }
    await admin.end();
  });

  it('turns a database at old 0012 into exactly what 0000_initial creates', async () => {
    const old = await scratchDatabase();
    try {
      await migrateWith(old, PRE_SQUASH);
      expect(await describeSchema(old)).not.toEqual(freshSchema);

      expect(await baselineMigrations(old, SQUASHED)).toBe('baselined');

      expect(await describeSchema(old)).toEqual(freshSchema);
      expect(await history(old)).toEqual(await history(fresh));
    } finally {
      await old.end();
    }
  });

  it('leaves db:migrate nothing to run and keeps existing rows', async () => {
    const old = await scratchDatabase();
    try {
      await migrateWith(old, PRE_SQUASH);
      await old`insert into users (email, name) values ('owner@example.com', 'Owner')`;

      await baselineMigrations(old, SQUASHED);
      await migrateWith(old, SQUASHED);

      expect(await history(old)).toEqual(await history(fresh));
      expect([...(await old`select email from users`)]).toEqual([{ email: 'owner@example.com' }]);
      expect(await baselineMigrations(old, SQUASHED)).toBe('skipped');
    } finally {
      await old.end();
    }
  });

  it('skips a database with no migration history', async () => {
    const empty = await scratchDatabase();
    try {
      expect(await baselineMigrations(empty, SQUASHED)).toBe('skipped');
      const [{ exists }] = await empty`
        select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
      expect(exists).toBe(false);
    } finally {
      await empty.end();
    }
  });

  it('skips a database already on 0000_initial', async () => {
    expect(await baselineMigrations(fresh, SQUASHED)).toBe('skipped');
    expect(await describeSchema(fresh)).toEqual(freshSchema);
  });

  it('refuses a history that stops partway through the old chain', async () => {
    const partial = await scratchDatabase();
    try {
      await migrateWith(partial, PRE_SQUASH);
      await partial`delete from drizzle.__drizzle_migrations
                    where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`;

      await expect(baselineMigrations(partial, SQUASHED)).rejects.toThrow(/refusing to baseline/);
      expect(
        [...(await partial`select to_regclass('public.conversations') as t`)][0].t,
      ).not.toBeNull();
    } finally {
      await partial.end();
    }
  });
});
