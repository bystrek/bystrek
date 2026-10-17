import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { localOwnerNeedsPassword, seedLocalOwner } from './local-owner';

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL;
  const name = process.env.SEED_OWNER_NAME;
  const databaseUrl = process.env.DATABASE_URL;
  if (!email || !name || !databaseUrl) {
    throw new Error('SEED_OWNER_EMAIL, SEED_OWNER_NAME and DATABASE_URL are required');
  }
  if (new URL(databaseUrl).pathname !== '/bystrek_dev') {
    throw new Error('Local seed requires a dedicated bystrek_dev database');
  }
  if (!['--check', '--create'].includes(process.argv[2]) || process.argv.length !== 3) {
    throw new Error('Usage: bun run src/db/seed-local.ts --check|--create');
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  try {
    const needsPassword = await localOwnerNeedsPassword(db, email);
    if (process.argv[2] === '--check') {
      console.log(needsPassword ? 'needs-password' : 'ready');
    } else if (needsPassword) {
      await seedLocalOwner(db, email, name, await Bun.stdin.text());
      console.log('Local owner ready');
    }
  } finally {
    await client.end();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
