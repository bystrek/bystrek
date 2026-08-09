import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '../env';
import * as schema from './schema';
import { households, users } from './schema';

const HOUSEHOLD_NAME = 'bystrek';
const OWNER = { name: 'Michał', email: 'bobrowicz.michal@gmail.com' };

async function seed() {
  const db = drizzle(postgres(DATABASE_URL), { schema });

  let [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, HOUSEHOLD_NAME));

  if (!household) {
    [household] = await db
      .insert(households)
      .values({ name: HOUSEHOLD_NAME })
      .returning();
    console.log(`created household "${HOUSEHOLD_NAME}"`);
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, OWNER.email));

  if (!existing) {
    await db.insert(users).values({
      householdId: household.id,
      email: OWNER.email,
      name: OWNER.name,
      emailVerified: true,
      status: 'active',
    });
    console.log(`created user "${OWNER.name}"`);
  }

  process.exit(0);
}

seed();
