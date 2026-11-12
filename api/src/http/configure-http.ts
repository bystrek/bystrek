import type { INestApplication } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { AUTH } from '../auth/auth.provider';
import type { Auth } from '../auth/auth.config';
import { requireApiToken } from '../auth/verify-api-token';

// A Health Auto Export backfill sends months of samples in one body. Parsing holds the raw
// body, its string and the parsed objects at once, several times the body's size, against the
// API pod's 512 MiB, so a longer backfill goes in a few pushes.
const HEALTH_IMPORT_LIMIT = '20mb';

// Body parsing for an app created with `bodyParser: false`. better-auth needs the raw
// (unparsed) request body, so it's mounted ahead of the JSON parser every other route relies on.
export function configureHttp(app: INestApplication): void {
  // `app.use()` already matches by path prefix — a trailing wildcard here
  // makes Express fold the whole matched path (including the auth token
  // segment) into req.baseUrl, which breaks better-auth's own query-string
  // reconstruction for routes like GET /reset-password/:token?callbackURL=.
  const auth = app.get<Auth>(AUTH);
  app.use('/api/auth', toNodeHandler(auth));
  // The token is checked before the large body is read, so a request without one can't make
  // the API buffer and parse it. Parsed here, the body skips the default-limit parser below.
  app.use('/health/import', requireApiToken(auth), express.json({ limit: HEALTH_IMPORT_LIMIT }));
  app.use(express.json());
}
