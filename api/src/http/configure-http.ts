import type { INestApplication } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { AUTH } from '../auth/auth.provider';
import type { Auth } from '../auth/auth.config';

// A Health Auto Export backfill sends months of samples in one body.
const HEALTH_IMPORT_LIMIT = '50mb';

// Body parsing for an app created with `bodyParser: false`. better-auth needs the raw
// (unparsed) request body, so it's mounted ahead of the JSON parser every other route relies on.
export function configureHttp(app: INestApplication): void {
  // `app.use()` already matches by path prefix — a trailing wildcard here
  // makes Express fold the whole matched path (including the auth token
  // segment) into req.baseUrl, which breaks better-auth's own query-string
  // reconstruction for routes like GET /reset-password/:token?callbackURL=.
  app.use('/api/auth', toNodeHandler(app.get<Auth>(AUTH)));
  // Parsed here, the body skips the default-limit parser below.
  app.use('/health/import', express.json({ limit: HEALTH_IMPORT_LIMIT }));
  app.use(express.json());
}
