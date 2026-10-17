import 'dotenv/config';
import postgres from 'postgres';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const url = new URL(databaseUrl);
  if (url.pathname !== '/bystrek_dev') {
    throw new Error('Local setup requires a dedicated bystrek_dev database');
  }

  url.pathname = '/postgres';
  const db = postgres(url.toString());
  try {
    const [existing] = await db`select 1 from pg_database where datname = 'bystrek_dev'`;
    if (!existing) {
      await db.unsafe('CREATE DATABASE bystrek_dev');
      console.log('Created local development database');
    }
  } finally {
    await db.end();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
