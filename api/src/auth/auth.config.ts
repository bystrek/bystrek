import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, oneTimeToken } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { API_URL, AUTH_SECRET, CORS_ORIGINS, LOCALHOST_ORIGIN_PATTERN } from '../env';
import * as schema from '../db/schema';
import { apiTokens } from './api-tokens';
import { POCKET_ID, Role, pocketId, roleFromIdToken } from './pocket-id';

export type Auth = ReturnType<typeof createAuth>;

// A 256px JPEG at quality 0.8 (the UI's client-side downscale target) is tens
// of KB; this caps the stored data-URL string length at 280,000 chars
// (~210KB decoded), well above that, to leave headroom without allowing
// arbitrarily large payloads. Checking string length avoids decoding
// untrusted input just to reject most of it.
const MAX_IMAGE_BASE64_LENGTH = 280_000;

export function createAuth(db: PostgresJsDatabase<typeof schema>) {
  // Every Pocket ID sign-in stores a fresh ID token on the account (create on
  // the first sign-in or link, update after that), so the role follows the
  // user's Pocket ID groups from one sign-in to the next.
  const syncRole = async (account: {
    providerId: string;
    userId: string;
    idToken?: string | null;
  }) => {
    if (account.providerId !== POCKET_ID || !account.idToken) return;
    await db
      .update(schema.users)
      .set({ role: roleFromIdToken(account.idToken) })
      .where(eq(schema.users.id, account.userId));
  };

  return betterAuth({
    secret: AUTH_SECRET,
    baseURL: API_URL,
    basePath: '/api/auth',
    trustedOrigins: [...CORS_ORIGINS, LOCALHOST_ORIGIN_PATTERN],
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
    advanced: {
      database: { generateId: false },
    },
    emailAndPassword: { enabled: false },
    account: {
      // An existing user's first Pocket ID sign-in attaches to their row by email.
      accountLinking: { enabled: true, trustedProviders: [POCKET_ID] },
    },
    session: {
      // Removing someone in Pocket ID only blocks new sign-ins, so a session
      // must end on its own: 7 days after the Pocket ID sign-in that made it,
      // never extended by use.
      expiresIn: 60 * 60 * 24 * 7,
      disableSessionRefresh: true,
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
        // Set from Pocket ID groups only (`syncRole`), never by the client.
        role: { type: 'string', required: false, input: false, defaultValue: Role.User },
      },
    },
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            if (typeof user.image === 'string' && user.image.length > MAX_IMAGE_BASE64_LENGTH) {
              throw new APIError('PAYLOAD_TOO_LARGE', {
                message: 'Image is too large.',
              });
            }
          },
        },
      },
      account: {
        create: { after: syncRole },
        update: { after: syncRole },
      },
    },
    plugins: [
      pocketId(),
      bearer(),
      // Hands the session from the OAuth callback to the UI (see SignInController).
      // Tokens are minted only server-side, single-use, and expire in 3 minutes.
      oneTimeToken({ disableClientRequest: true, storeToken: 'hashed' }),
      apiTokens(),
    ],
  });
}
