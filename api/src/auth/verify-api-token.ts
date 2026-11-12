import type { NextFunction, Request, Response } from 'express';
import type { Auth } from './auth.config';

declare module 'express' {
  interface Request {
    /**
     * The user a personal API token belongs to, set by `requireApiToken` or `ApiTokenGuard`.
     * Only server code sets it; a client can't.
     */
    apiTokenUserId?: string;
  }
}

const BEARER = /^Bearer (\S+)$/i;

/** The owner of the request's `Authorization: Bearer <personal API token>`, if it's valid. */
export async function verifyApiToken(auth: Auth, request: Request): Promise<string | undefined> {
  const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
  if (!token) return undefined;
  const { valid, key } = await auth.api.verifyApiKey({ body: { key: token } });
  return valid && key ? key.referenceId : undefined;
}

/**
 * Express middleware that answers 401 before anything reads the body, for routes that accept
 * large bodies (mounted ahead of their parser in configure-http.ts). It runs outside Nest, so it
 * writes the same response `UnauthorizedException` would. `ApiTokenGuard` then reuses the owner.
 */
export const requireApiToken =
  (auth: Auth) =>
  (request: Request, response: Response, next: NextFunction): void => {
    verifyApiToken(auth, request).then((userId) => {
      if (!userId) {
        response.status(401).json({ message: 'Unauthorized', statusCode: 401 });
        return;
      }
      request.apiTokenUserId = userId;
      next();
    }, next);
  };
