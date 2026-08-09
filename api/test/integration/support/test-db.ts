import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../src/db/schema';
import { DATABASE_URL } from '../../../src/env';

export const testDb = drizzle(postgres(DATABASE_URL), { schema });
