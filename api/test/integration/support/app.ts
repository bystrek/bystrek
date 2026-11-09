import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { toNodeHandler } from 'better-auth/node';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import express from 'express';
import { AppModule } from '../../../src/app.module';
import { AUTH } from '../../../src/auth/auth.provider';
import type { Auth } from '../../../src/auth/auth.config';
import { DRIZZLE } from '../../../src/db/drizzle.provider';
import type * as schema from '../../../src/db/schema';

type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

/** The app on `tx`, with better-auth mounted at /api/auth the way main.ts mounts it. */
export async function createApp(tx: Tx): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(tx)
    .compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.use('/api/auth', toNodeHandler(app.get<Auth>(AUTH)));
  app.use(express.json());
  await app.init();
  return app;
}
