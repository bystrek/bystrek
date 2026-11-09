import { genericOAuth } from 'better-auth/plugins';
import { decodeJwt } from 'jose';
import { OIDC_ADMIN_GROUP, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_ISSUER } from '../env';

export const POCKET_ID = 'pocket-id';

export const Role = { User: 'user', Admin: 'admin' } as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Pocket ID as the only sign-in method. Its callback is `/api/auth/callback/pocket-id`. */
export const pocketId = () =>
  genericOAuth({
    config: [
      {
        providerId: POCKET_ID,
        name: 'Pocket ID',
        // Fetched once, on the first request. If Pocket ID is down then, sign-in
        // stays broken until the API restarts; existing sessions keep working.
        discoveryUrl: `${OIDC_ISSUER}/.well-known/openid-configuration`,
        // Accounts are keyed on (issuer, sub). Pinning the issuer keeps a failed
        // discovery from taking every request down with it.
        accountIssuer: OIDC_ISSUER,
        clientId: OIDC_CLIENT_ID,
        clientSecret: OIDC_CLIENT_SECRET,
        scopes: ['openid', 'email', 'profile', 'groups'],
        pkce: true,
        // `name` and `image` (from `picture`) are mapped by default. All four
        // only fill a new user: they are edited in bystrek afterwards.
        mapProfileToUser: (profile) => ({
          firstName: profile.given_name,
          lastName: profile.family_name,
        }),
      },
    ],
  });

/**
 * The role a Pocket ID ID token grants: admin for members of
 * `OIDC_ADMIN_GROUP`. better-auth has verified the token before storing it.
 */
export function roleFromIdToken(idToken: string): Role {
  const { groups } = decodeJwt(idToken);
  return Array.isArray(groups) && groups.includes(OIDC_ADMIN_GROUP) ? Role.Admin : Role.User;
}
