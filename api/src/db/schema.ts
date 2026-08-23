import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const subscriptions = pgTable('subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userStatus = pgEnum('user_status', ['invited', 'active']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    // `image` is a better-auth core field, handled automatically.
    // `firstName`/`lastName` are declared as `user.additionalFields` in
    // auth.config.ts so the same update-user/get-session endpoints cover them.
    image: text('image'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    emailVerified: boolean('email_verified').notNull().default(false),
    status: userStatus('status').notNull().default('invited'),
    // No settings UI yet — set from sensible defaults, editable later
    // alongside profile/calendar settings. Used to give the chat system
    // prompt real "now"/formatting context (see devlog day 12).
    timezone: text('timezone').notNull().default('Europe/Warsaw'),
    locale: text('locale').notNull().default('en-PL'),
    // better-auth admin plugin
    role: text('role').notNull().default('user'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

// better-auth core tables (session/account/verification) — field shapes
// match what the library's adapter expects; see auth/auth.config.ts.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // better-auth admin plugin (session impersonation) — unused, kept so
    // the admin plugin's schema expectations are met from the start.
    impersonatedBy: text('impersonated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('accounts_issuer_account_id_unique').on(table.issuer, table.accountId),
    index('accounts_user_id_idx').on(table.userId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

// Shared across domain tables: a record is visible to every user or just its
// owner. Defined once here so every future domain table reuses it.
export const visibility = pgEnum('visibility', ['private', 'shared']);

export const messageRole = pgEnum('message_role', ['user', 'assistant']);

// One continuous thread per user, not per-conversation — see devlog day 9.
// `content` holds an encrypted, JSON-serialized Anthropic `MessageParam`
// content value (a string or a content-block array, e.g. tool_use/tool_result),
// so the raw sequence sent to/from Claude can be replayed exactly.
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    visibility: visibility('visibility').notNull().default('private'),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    // clock_timestamp(), not defaultNow() (= now(), frozen for a whole
    // transaction): a single reply persists several rows in quick
    // succession, and their relative order (fed back to Claude as
    // conversation history, and returned by GET /chat/history) must reflect
    // real insertion order even when those inserts share one transaction.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [index('messages_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

// One CalDAV account per user (Infomaniak kCalendar — see docs/roadmap.md).
// `password` is tier-2 encrypted (api/src/crypto/field-encryption.ts), same
// as `messages.content`; `caldavUrl`/`username`/`calendarUrl`/
// `calendarDisplayName` aren't credentials on their own so are stored plain.
export const calendarCredentials = pgTable(
  'calendar_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caldavUrl: text('caldav_url').notNull(),
    username: text('username').notNull(),
    password: text('password').notNull(),
    // Target calendar's own URL (stable, server-assigned — not a
    // human-typed display name, so no encoding/mismatch class of bug); null
    // picks the first calendar returned for the account. `calendarDisplayName`
    // is a cached label only, for showing something readable on the profile
    // page without reconnecting to CalDAV on every page load — never used
    // to identify the calendar.
    calendarUrl: text('calendar_url'),
    calendarDisplayName: text('calendar_display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('calendar_credentials_user_id_unique').on(table.userId)],
);
