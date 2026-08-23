import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer } from 'better-auth/plugins';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { API_URL, AUTH_SECRET, CORS_ORIGINS } from '../env';
import type * as schema from '../db/schema';
import { sendEmail } from './resend';

export type Auth = ReturnType<typeof createAuth>;

// A 256px JPEG at quality 0.8 (the UI's client-side downscale target) is tens
// of KB; this caps the stored data-URL string length at 280,000 chars
// (~210KB decoded), well above that, to leave headroom without allowing
// arbitrarily large payloads. Checking string length avoids decoding
// untrusted input just to reject most of it.
const MAX_IMAGE_BASE64_LENGTH = 280_000;

export function createAuth(db: PostgresJsDatabase<typeof schema>) {
  return betterAuth({
    secret: AUTH_SECRET,
    baseURL: API_URL,
    basePath: '/api/auth',
    trustedOrigins: CORS_ORIGINS,
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
    advanced: {
      database: { generateId: false },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          user.email,
          'Reset your bystrek password',
          `<p>Click below to set a new password.</p><p><a href="${url}">${url}</a></p><p>This link expires in an hour.</p>`,
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 days
      updateAge: 60 * 60 * 24, // refresh if used within the last day
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
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
    },
    plugins: [admin(), bearer()],
  });
}
