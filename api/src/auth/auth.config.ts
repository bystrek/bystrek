import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer } from 'better-auth/plugins';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { API_URL, AUTH_SECRET, CORS_ORIGINS } from '../env';
import type * as schema from '../db/schema';
import { sendEmail } from './resend';

export type Auth = ReturnType<typeof createAuth>;

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
    plugins: [admin(), bearer()],
  });
}
