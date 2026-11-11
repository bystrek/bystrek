import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH } from './auth.provider';
import type { Auth } from './auth.config';

declare module 'express' {
  interface Request {
    /** The user a personal API token belongs to, set by `ApiTokenGuard`. */
    apiTokenUserId?: string;
  }
}

const BEARER = /^Bearer (\S+)$/i;

/**
 * Accepts `Authorization: Bearer <personal API token>` (see api-tokens.ts) and
 * nothing else, so a route opts in to tokens by using this guard instead of
 * `AuthGuard`. `AuthGuard` never accepts a token.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    const { valid, key } = await this.auth.api.verifyApiKey({ body: { key: token } });
    if (!valid || !key) throw new UnauthorizedException();
    request.apiTokenUserId = key.referenceId;
    return true;
  }
}
