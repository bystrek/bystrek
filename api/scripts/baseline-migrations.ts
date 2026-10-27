import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

/**
 * One-time bridge from the pre-squash migration chain (0000_gorgeous_lake …
 * 0013_drop_chat_push) to the squashed 0000_initial. Drizzle runs every
 * migration newer than the latest applied `created_at`, so a database built
 * by the old chain would re-run 0000_initial against its existing tables.
 *
 * On such a database this applies the one schema change 0000_initial has
 * over old 0012 (the old 0013's drops) and replaces the migration history
 * with the row drizzle would have written for 0000_initial. Anything else —
 * a fresh database, or one already on the squashed chain — is left alone.
 *
 * Runs before `db:migrate` in docker-entrypoint.sh. Remove once production
 * has been baselined.
 */

// `when` of the last two old-chain migrations. Only a database that stopped
// at one of these is known to match 0000_initial after the drops below.
const OLD_CHAIN_HEADS = [
  1792250210644, // 0012_stormy_big_bertha
  1792674352638, // 0013_drop_chat_push
];

// Old 0013_drop_chat_push, made idempotent for a database already past it.
const DROP_REMOVED_TABLES = `
  DROP TABLE IF EXISTS "conversations" CASCADE;
  DROP TABLE IF EXISTS "messages" CASCADE;
  DROP TABLE IF EXISTS "subscriptions" CASCADE;
  DROP TYPE IF EXISTS "public"."message_content_format";
  DROP TYPE IF EXISTS "public"."message_role";
`;

const DEFAULT_MIGRATIONS_FOLDER = `${__dirname}/../drizzle`;

export type BaselineResult = 'baselined' | 'skipped';

export async function baselineMigrations(
  sql: postgres.Sql,
  migrationsFolder = DEFAULT_MIGRATIONS_FOLDER,
): Promise<BaselineResult> {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists
  `;
  if (!exists) {
    return 'skipped';
  }

  const initial = await readInitialMigration(migrationsFolder);
  const [{ latest }] = await sql<{ latest: string | null }[]>`
    select max(created_at)::text as latest from drizzle.__drizzle_migrations
  `;
  if (latest === null || Number(latest) >= initial.when) {
    return 'skipped';
  }
  if (!OLD_CHAIN_HEADS.includes(Number(latest))) {
    throw new Error(
      `Migration history ends at created_at=${latest}, which is neither the squashed ` +
        `0000_initial nor a known head of the old chain; refusing to baseline.`,
    );
  }

  await sql.begin(async (tx) => {
    await tx.unsafe(DROP_REMOVED_TABLES);
    await tx`delete from drizzle.__drizzle_migrations`;
    await tx`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${initial.hash}, ${initial.when})
    `;
  });
  return 'baselined';
}

async function readInitialMigration(migrationsFolder: string) {
  const journal = JSON.parse(await readFile(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const entry = journal.entries.find((e) => e.tag === '0000_initial');
  if (!entry) {
    throw new Error('0000_initial is missing from the migration journal');
  }
  // Same hash drizzle's migrator computes: sha256 of the whole file.
  const query = await readFile(`${migrationsFolder}/${entry.tag}.sql`, 'utf8');
  return { when: entry.when, hash: createHash('sha256').update(query).digest('hex') };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing required env var: DATABASE_URL');
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const result = await baselineMigrations(sql);
    console.log(
      result === 'baselined'
        ? 'Baselined pre-squash migration history onto 0000_initial'
        : 'Migration baseline not needed',
    );
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
