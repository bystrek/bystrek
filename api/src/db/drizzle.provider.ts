import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '../env';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: () => {
    const client = postgres(DATABASE_URL);
    return drizzle(client, { schema });
  },
};
