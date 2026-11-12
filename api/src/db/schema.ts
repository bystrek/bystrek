import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { OsmType } from '../geo/geocoder';
import { DiaryEventSource } from '../diary/diary-event-source';
import { PlaceCategory } from '../places/place-category';

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
    // No settings UI yet — set from sensible defaults, editable later.
    timezone: text('timezone').notNull().default('Europe/Warsaw'),
    locale: text('locale').notNull().default('en-PL'),
    // Follows the user's Pocket ID groups; see auth/pocket-id.ts.
    role: text('role').notNull().default('user'),
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

// Personal API tokens: better-auth's api-key plugin model (see
// auth/api-tokens.ts), so every field it reads or writes is here, including
// the rate-limit and refill ones bystrek leaves unused. `key` is a SHA-256
// hash; the token itself is shown once, at creation.
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configId: text('config_id').notNull().default('default'),
    // The owning user; the plugin's generic name for it.
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    start: text('start'),
    prefix: text('prefix'),
    key: text('key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastRequest: timestamp('last_request', { withTimezone: true }),
    requestCount: integer('request_count').notNull().default(0),
    rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    remaining: integer('remaining'),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    permissions: text('permissions'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('api_tokens_key_unique').on(table.key),
    index('api_tokens_reference_id_idx').on(table.referenceId),
  ],
);

// Shared across domain tables: a record is visible to every user or just its
// owner. Defined once here so every future domain table reuses it.
export const visibility = pgEnum('visibility', ['private', 'shared']);

// One CalDAV account per user (Infomaniak kCalendar).
// `password` is tier-2 encrypted (api/src/crypto/field-encryption.ts);
// `caldavUrl`/`username`/`calendarUrl`/`calendarDisplayName` aren't
// credentials on their own so are stored plain.
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

export const calendarSyncStatus = pgEnum('calendar_sync_status', [
  'pending',
  'syncing',
  'ready',
  'error',
]);

// The local copy of a user's calendar (api/src/calendar/calendar-sync.service.ts).
// Keyed on the credentials row, so removing the credentials removes the copy.
// Deleting this row wipes the copy: `calendar_objects` cascades from it.
export const calendarSyncState = pgTable('calendar_sync_state', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => calendarCredentials.userId, { onDelete: 'cascade' }),
  // Resolved by discovery and cached so reads skip it; null until the first sync runs it.
  calendarUrl: text('calendar_url'),
  // The token of the last sync-collection report applied to the copy.
  syncToken: text('sync_token'),
  // The token returned by the first download's listing. Becomes `syncToken` once every
  // listed object is downloaded, so a restart resumes instead of starting over.
  pendingSyncToken: text('pending_sync_token'),
  // `getctag` (or the PROPFIND sync-token where a server has no ctag) from before the last
  // applied report. Null forces the next read to run a sync.
  ctag: text('ctag'),
  status: calendarSyncStatus('status').notNull().default('pending'),
  fetched: integer('fetched').notNull().default(0),
  total: integer('total'),
  error: text('error'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Raw calendar objects, expanded at query time. `ics` is null between the first
// download's listing and the batch that fetches it.
export const calendarObjects = pgTable(
  'calendar_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => calendarSyncState.userId, { onDelete: 'cascade' }),
    href: text('href').notNull(),
    etag: text('etag'),
    uid: text('uid'),
    ics: text('ics'),
  },
  (table) => [
    uniqueIndex('calendar_objects_user_id_href_unique').on(table.userId, table.href),
    index('calendar_objects_user_id_uid_idx').on(table.userId, table.uid),
  ],
);

export const osmType = pgEnum('osm_type', OsmType);
export const placeCategory = pgEnum('place_category', PlaceCategory);

// Points of interest, shared by every user. Location fields come from the geocoder
// (OpenStreetMap, ODbL), resolved server-side from `osmType`/`osmId`; never from the client.
export const places = pgTable(
  'places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: placeCategory('category').notNull(),
    // As the user wrote it; `displayAddress` is the geocoder's version.
    address: text('address').notNull(),
    displayAddress: text('display_address').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    osmType: osmType('osm_type').notNull(),
    // OSM node ids are past 2^32 already.
    osmId: bigint('osm_id', { mode: 'number' }).notNull(),
    notes: text('notes'),
    url: text('url'),
    // The place outlives the user who added it.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('places_osm_unique').on(table.osmType, table.osmId)],
);

// "Visited" is per user.
export const placeVisits = pgTable(
  'place_visits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.placeId] }),
    index('place_visits_place_id_idx').on(table.placeId),
  ],
);

// The diary (#160) is private: every row belongs to one user.

// What the user typed, exactly as received. Never modified: events are derived from it.
export const diaryNotes = pgTable(
  'diary_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rawText: text('raw_text').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('diary_notes_user_id_idx').on(table.userId)],
);

// A user's own categories, created as they confirm them. `parentId` is for later groupings
// (creatine → supplement → health).
export const diaryCategories = pgTable(
  'diary_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id').references((): AnyPgColumn => diaryCategories.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [uniqueIndex('diary_categories_user_id_name_unique').on(table.userId, table.name)],
);

export const diaryEventSource = pgEnum('diary_event_source', DiaryEventSource);

// Something that happened: a point (`endsAt` null) or a span. Typed events come from a note;
// imported ones have none and are upserted on (`source`, `externalId`).
export const diaryEvents = pgTable(
  'diary_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').references(() => diaryNotes.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    categoryId: uuid('category_id').references(() => diaryCategories.id, { onDelete: 'set null' }),
    source: diaryEventSource('source').notNull(),
    externalId: text('external_id'),
    // A measured amount, for imports that carry one: a weight, a workout's active energy, a dose.
    quantity: doublePrecision('quantity'),
    unit: text('unit'),
    // Which draft prompt produced the event; null for imports and events the user wrote.
    extractorVersion: text('extractor_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('diary_events_user_id_source_external_id_unique').on(
      table.userId,
      table.source,
      table.externalId,
    ),
    index('diary_events_user_id_occurred_at_idx').on(table.userId, table.occurredAt),
    index('diary_events_note_id_idx').on(table.noteId),
    index('diary_events_category_id_idx').on(table.categoryId),
    check(
      'diary_events_span_order',
      sql`${table.endsAt} is null or ${table.endsAt} >= ${table.occurredAt}`,
    ),
  ],
);

// Health Auto Export pushes (#167), exactly as received. Never modified: `health` diary events are
// derived from them and can be rebuilt if a mapper changes. Types without a mapper stay only here.
export const healthImports = pgTable(
  'health_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (table) => [index('health_imports_user_id_idx').on(table.userId)],
);
