import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { AppModule } from './app.module';
import { AUTH } from './auth/auth.provider';
import { CORS_ORIGINS } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: CORS_ORIGINS, exposedHeaders: ['set-auth-token'] });

  // better-auth needs the raw (unparsed) request body, so it's mounted
  // ahead of Nest's own JSON body parser, which every other route relies on.
  const auth = app.get(AUTH);
  // `app.use()` already matches by path prefix — a trailing wildcard here
  // makes Express fold the whole matched path (including the auth token
  // segment) into req.baseUrl, which breaks better-auth's own query-string
  // reconstruction for routes like GET /reset-password/:token?callbackURL=.
  app.use('/api/auth', toNodeHandler(auth));
  app.use(express.json());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
