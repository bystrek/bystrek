import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createAuth } from '../auth/auth.config';
import { DATABASE_URL, UI_URL } from '../env';
import * as schema from './schema';
import { users } from './schema';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const OWNER = {
  name: required('SEED_OWNER_NAME'),
  email: required('SEED_OWNER_EMAIL'),
};

async function seed() {
  const db = drizzle(postgres(DATABASE_URL), { schema });

  const [existing] = await db.select().from(users).where(eq(users.email, OWNER.email));

  if (!existing) {
    await db.insert(users).values({
      email: OWNER.email,
      name: OWNER.name,
      emailVerified: true,
      status: 'active',
      role: 'admin',
    });
    console.log(`created user "${OWNER.name}"`);

    const auth = createAuth(db);
    await auth.api.requestPasswordReset({
      body: {
        email: OWNER.email,
        redirectTo: `${UI_URL}/auth/reset-password`,
      },
    });
    console.log(`sent password-setup email to ${OWNER.email}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
