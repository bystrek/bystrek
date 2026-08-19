import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AUTH } from './auth.provider';
import type { Auth } from './auth.config';

declare module 'express' {
  interface Request {
    session?: Awaited<ReturnType<Auth['api']['getSession']>>;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) protected readonly auth: Auth) {}

  protected async requireSession(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      throw new UnauthorizedException();
    }
    request.session = session;
    return session;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.requireSession(context);
    return true;
  }
}

@Injectable()
export class AdminGuard extends AuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const session = await this.requireSession(context);
    if (session.user.role !== 'admin') {
      throw new UnauthorizedException();
    }
    return true;
  }
}
