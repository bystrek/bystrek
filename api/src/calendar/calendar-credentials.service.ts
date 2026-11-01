import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { assertSafeCaldavUrl } from './caldav-url';
import { lockCalendarCopy, type Db, type Tx } from './calendar-copy-lock';
import { decryptField, encryptField } from '../crypto/field-encryption';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { calendarCredentials, calendarSyncState } from '../db/schema';

export interface CalendarCredentials {
  caldavUrl: string;
  username: string;
  password: string;
  // Target calendar's own URL (stable, server-assigned), not a
  // human-typed display name — see schema.ts. Null picks the first
  // calendar returned for the account.
  calendarUrl: string | null;
}

export interface CalendarCredentialsSummary {
  configured: boolean;
  caldavUrl: string | null;
  username: string | null;
  calendarUrl: string | null;
  // Cached label only, for display — never used to identify the calendar.
  calendarDisplayName: string | null;
}

@Injectable()
export class CalendarCredentialsService {
  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {}

  // Full record including the decrypted password — internal use only
  // (the calendar copy connecting to CalDAV), never returned from an
  // endpoint. `db` lets a sync read them inside its own transaction.
  async getInternal(userId: string, db: Db | Tx = this.db): Promise<CalendarCredentials | null> {
    const [row] = await db
      .select()
      .from(calendarCredentials)
      .where(eq(calendarCredentials.userId, userId));
    if (!row) return null;
    return {
      caldavUrl: row.caldavUrl,
      username: row.username,
      password: decryptField(row.password),
      calendarUrl: row.calendarUrl,
    };
  }

  // Redacted, endpoint-safe view — never includes the password. Backs the
  // profile page's settings form, which only ever needs to show whether
  // credentials are set.
  async getDisplayable(userId: string): Promise<CalendarCredentialsSummary> {
    const [row] = await this.db
      .select({
        caldavUrl: calendarCredentials.caldavUrl,
        username: calendarCredentials.username,
        calendarUrl: calendarCredentials.calendarUrl,
        calendarDisplayName: calendarCredentials.calendarDisplayName,
      })
      .from(calendarCredentials)
      .where(eq(calendarCredentials.userId, userId));
    if (!row) {
      return {
        configured: false,
        caldavUrl: null,
        username: null,
        calendarUrl: null,
        calendarDisplayName: null,
      };
    }
    return { configured: true, ...row };
  }

  // An empty `password` on an existing row means "keep the current one" —
  // the profile form never shows the stored password back, so leaving the
  // field blank while editing other fields must not wipe it.
  async set(
    userId: string,
    input: {
      caldavUrl: string;
      username: string;
      password: string;
      calendarUrl: string | null;
      calendarDisplayName: string | null;
    },
  ): Promise<void> {
    if (typeof input.caldavUrl !== 'string' || !input.caldavUrl.trim()) {
      throw new BadRequestException('caldavUrl is required');
    }
    if (typeof input.username !== 'string' || !input.username.trim()) {
      throw new BadRequestException('username is required');
    }
    assertSafeCaldavUrl(input.caldavUrl);

    await this.db.transaction(async (tx) => {
      await lockCalendarCopy(tx, userId);
      const [existing] = await tx
        .select()
        .from(calendarCredentials)
        .where(eq(calendarCredentials.userId, userId));

      let password = input.password ? encryptField(input.password) : null;
      if (!password) {
        if (!existing) throw new BadRequestException('password is required to connect a calendar');
        password = existing.password;
      }

      const values = {
        caldavUrl: input.caldavUrl,
        username: input.username,
        password,
        calendarUrl: input.calendarUrl,
        calendarDisplayName: input.calendarDisplayName,
      };
      await tx
        .insert(calendarCredentials)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: calendarCredentials.userId, set: values });

      // Another account or calendar makes the local copy someone else's data: wipe it, and
      // the next read starts a fresh sync. A new password alone keeps it.
      if (
        existing &&
        (existing.caldavUrl !== input.caldavUrl ||
          existing.username !== input.username ||
          existing.calendarUrl !== input.calendarUrl)
      ) {
        await tx.delete(calendarSyncState).where(eq(calendarSyncState.userId, userId));
      } else if (input.password) {
        // A sync that failed on the old password picks up where it stopped.
        await tx
          .update(calendarSyncState)
          .set({ status: 'pending', error: null })
          .where(and(eq(calendarSyncState.userId, userId), eq(calendarSyncState.status, 'error')));
      }
    });
  }

  async remove(userId: string): Promise<void> {
    await this.db.delete(calendarCredentials).where(eq(calendarCredentials.userId, userId));
  }
}
