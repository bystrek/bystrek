import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { localOwnerNeedsPassword, seedLocalOwner } from './local-owner';

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL;
  const name = process.env.SEED_OWNER_NAME;
  const password = process.env.SEED_OWNER_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;
  if (!email || !name || !password || !databaseUrl) {
    throw new Error(
      'SEED_OWNER_EMAIL, SEED_OWNER_NAME, SEED_OWNER_PASSWORD and DATABASE_URL are required',
    );
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  try {
    if (await localOwnerNeedsPassword(db, email)) {
      await seedLocalOwner(db, email, name, password);
      console.log(`Local owner ${email} ready`);
    } else {
      console.log(`Local owner ${email} already has a password`);
    }
  } finally {
    await client.end();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
