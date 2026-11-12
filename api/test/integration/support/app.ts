import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AppModule } from '../../../src/app.module';
import { DRIZZLE } from '../../../src/db/drizzle.provider';
import { configureHttp } from '../../../src/http/configure-http';
import type * as schema from '../../../src/db/schema';

type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

/** The app on `tx`, with body parsing configured the way main.ts configures it. */
export async function createApp(tx: Tx): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(tx)
    .compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureHttp(app);
  await app.init();
  return app;
}
