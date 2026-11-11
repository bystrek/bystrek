import { Provider } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '../env';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: () => {
    const client = postgres(DATABASE_URL);
    return drizzle(client, { schema });
  },
};
