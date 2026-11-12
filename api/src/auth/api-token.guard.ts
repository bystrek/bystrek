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
import { verifyApiToken } from './verify-api-token';

/**
 * Accepts `Authorization: Bearer <personal API token>` (see api-tokens.ts) and
 * nothing else, so a route opts in to tokens by using this guard instead of
 * `AuthGuard`. `AuthGuard` never accepts a token. When `requireApiToken` already
 * verified the token ahead of a large body, the guard reuses its result; on any
 * other route the field is unset and the guard verifies the token itself.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.apiTokenUserId ??= await verifyApiToken(this.auth, request);
    if (!request.apiTokenUserId) throw new UnauthorizedException();
    return true;
  }
}
