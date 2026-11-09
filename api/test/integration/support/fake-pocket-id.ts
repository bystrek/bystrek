import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from '../../../src/env';

export type PocketIdUser = {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  groups?: string[];
};

const KID = 'test';
const keys = generateKeyPair('RS256').then(async ({ publicKey, privateKey }) => ({
  privateKey,
  jwk: { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' },
}));

const endpoint = (path: string) => `${OIDC_ISSUER}${path}`;

/**
 * Pocket ID behind `fetch`: discovery, JWKS and the token endpoint, which
 * issues a signed ID token for whoever `authorize` let in. Installed for every
 * integration test (see `preload.ts`), so no test reaches the real issuer.
 */
export class FakePocketId {
  private readonly codes = new Map<string, { user: PocketIdUser; nonce: string | null }>();

  /** Signs `user` in at the authorization URL and returns the code Pocket ID would redirect with. */
  authorize(authorizationUrl: string, user: PocketIdUser): string {
    const url = new URL(authorizationUrl);
    if (url.href.split('?')[0] !== endpoint('/authorize')) throw new Error(`not Pocket ID: ${url}`);
    const code = crypto.randomUUID();
    this.codes.set(code, { user, nonce: url.searchParams.get('nonce') });
    return code;
  }

  handles(url: string): boolean {
    return url.startsWith(`${OIDC_ISSUER}/`);
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    switch (url.split('?')[0]) {
      case endpoint('/.well-known/openid-configuration'):
        return Response.json({
          issuer: OIDC_ISSUER,
          authorization_endpoint: endpoint('/authorize'),
          token_endpoint: endpoint('/api/oidc/token'),
          userinfo_endpoint: endpoint('/api/oidc/userinfo'),
          jwks_uri: endpoint('/.well-known/jwks.json'),
          id_token_signing_alg_values_supported: ['RS256'],
        });
      case endpoint('/.well-known/jwks.json'):
        return Response.json({ keys: [(await keys).jwk] });
      case endpoint('/api/oidc/token'):
        return this.token(new URLSearchParams(init?.body as string));
      default:
        return new Response(null, { status: 404 });
    }
  }

  private async token(body: URLSearchParams): Promise<Response> {
    const grant = this.codes.get(body.get('code') ?? '');
    if (!grant) return Response.json({ error: 'invalid_grant' }, { status: 400 });
    this.codes.delete(body.get('code')!);
    const idToken = await new SignJWT({
      ...grant.user,
      email_verified: true,
      ...(grant.nonce ? { nonce: grant.nonce } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(OIDC_ISSUER)
      .setAudience(OIDC_CLIENT_ID)
      .setSubject(grant.user.sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign((await keys).privateKey);
    return Response.json({
      access_token: crypto.randomUUID(),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken,
    });
  }
}

export const fakePocketId = new FakePocketId();
