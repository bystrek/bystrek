import { Provider } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import type * as schema from '../db/schema';
import { createAuth } from './auth.config';

export const AUTH = Symbol('AUTH');

export const authProvider: Provider = {
  provide: AUTH,
  inject: [DRIZZLE],
  useFactory: (db: PostgresJsDatabase<typeof schema>) => createAuth(db),
};
