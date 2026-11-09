import { BadRequestException, Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { API_URL } from '../env';
import { AUTH } from './auth.provider';
import type { Auth } from './auth.config';
import { POCKET_ID } from './pocket-id';
import { allowedReturnUrl } from './return-url';

function requireReturnUrl(to: unknown): URL {
  const url = allowedReturnUrl(to);
  if (!url) throw new BadRequestException('to must be a bystrek UI URL');
  return url;
}

const withTo = (path: string, to: URL) => `${API_URL}${path}?to=${encodeURIComponent(to.href)}`;

/**
 * Pocket ID sign-in for a UI on another origin (the web UI now, the Capacitor
 * app later), without cross-site cookies. The browser navigates to
 * `/auth/sign-in?to=<UI URL>`, signs in at Pocket ID, and lands on
 * `<UI URL>?ott=<one-time token>` (or `?error=<code>`). The UI swaps the token
 * for a bearer token at `POST /api/auth/one-time-token/verify`.
 */
@Controller('auth')
export class SignInController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  // Reachable through the UI dev server's proxy too, so it first moves the
  // browser to API_URL: the OAuth state cookie has to be set on the origin
  // Pocket ID calls back to.
  @Get('sign-in')
  signIn(@Query('to') to: unknown, @Res() res: Response) {
    res.redirect(withTo('/auth/sign-in/pocket-id', requireReturnUrl(to)));
  }

  @Get('sign-in/pocket-id')
  async signInWithPocketId(@Query('to') to: unknown, @Res() res: Response) {
    const returnUrl = requireReturnUrl(to);
    const { headers, response } = await this.auth.api.signInSocial({
      body: {
        provider: POCKET_ID,
        callbackURL: withTo('/auth/handoff', returnUrl),
        errorCallbackURL: returnUrl.href,
        disableRedirect: true,
      },
      returnHeaders: true,
    });
    res.setHeader('set-cookie', headers.getSetCookie());
    res.redirect(response.url!);
  }

  // Runs after the OAuth callback, with the session cookie it just set.
  @Get('handoff')
  async handoff(@Query('to') to: unknown, @Req() req: Request, @Res() res: Response) {
    const returnUrl = requireReturnUrl(to);
    const headers = fromNodeHeaders(req.headers);
    if (!(await this.auth.api.getSession({ headers }))) {
      returnUrl.searchParams.set('error', 'no_session');
      return res.redirect(returnUrl.href);
    }
    const { token } = await this.auth.api.generateOneTimeToken({ headers });
    // From here the UI's bearer token is the session; drop the cookie.
    const { name, attributes } = (await this.auth.$context).authCookies.sessionToken;
    res.clearCookie(name, {
      path: attributes.path ?? '/',
      domain: attributes.domain,
      secure: attributes.secure,
    });
    returnUrl.searchParams.set('ott', token);
    res.redirect(returnUrl.href);
  }
}
