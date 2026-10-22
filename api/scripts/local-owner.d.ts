import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
type Database = PostgresJsDatabase<typeof schema>;
export declare function localOwnerNeedsPassword(db: Database, email: string): Promise<boolean>;
export declare function seedLocalOwner(
  db: Database,
  email: string,
  name: string,
  password: string,
): Promise<void>;
export {};
