import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { assertSafeCaldavUrl } from './caldav-url';
import { decryptField, encryptField } from '../crypto/field-encryption';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { calendarCredentials } from '../db/schema';

export interface CalendarCredentials {
  caldavUrl: string;
  username: string;
  password: string;
  calendarName: string | null;
}

export interface CalendarCredentialsSummary {
  configured: boolean;
  caldavUrl: string | null;
  username: string | null;
  calendarName: string | null;
}

@Injectable()
export class CalendarCredentialsService {
  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {}

  // Full record including the decrypted password — internal use only
  // (CalendarService connecting to CalDAV), never returned from an
  // endpoint.
  async getInternal(userId: string): Promise<CalendarCredentials | null> {
    const [row] = await this.db
      .select()
      .from(calendarCredentials)
      .where(eq(calendarCredentials.userId, userId));
    if (!row) return null;
    return {
      caldavUrl: row.caldavUrl,
      username: row.username,
      password: decryptField(row.password),
      calendarName: row.calendarName,
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
        calendarName: calendarCredentials.calendarName,
      })
      .from(calendarCredentials)
      .where(eq(calendarCredentials.userId, userId));
    if (!row) return { configured: false, caldavUrl: null, username: null, calendarName: null };
    return { configured: true, ...row };
  }

  // An empty `password` on an existing row means "keep the current one" —
  // the profile form never shows the stored password back, so leaving the
  // field blank while editing other fields must not wipe it.
  async set(
    userId: string,
    input: { caldavUrl: string; username: string; password: string; calendarName: string | null },
  ): Promise<void> {
    if (typeof input.caldavUrl !== 'string' || !input.caldavUrl.trim()) {
      throw new BadRequestException('caldavUrl is required');
    }
    if (typeof input.username !== 'string' || !input.username.trim()) {
      throw new BadRequestException('username is required');
    }
    assertSafeCaldavUrl(input.caldavUrl);

    let password = input.password ? encryptField(input.password) : null;
    if (!password) {
      const [existing] = await this.db
        .select({ password: calendarCredentials.password })
        .from(calendarCredentials)
        .where(eq(calendarCredentials.userId, userId));
      if (!existing) throw new BadRequestException('password is required to connect a calendar');
      password = existing.password;
    }

    await this.db
      .insert(calendarCredentials)
      .values({
        userId,
        caldavUrl: input.caldavUrl,
        username: input.username,
        password,
        calendarName: input.calendarName,
      })
      .onConflictDoUpdate({
        target: calendarCredentials.userId,
        set: {
          caldavUrl: input.caldavUrl,
          username: input.username,
          password,
          calendarName: input.calendarName,
        },
      });
  }

  async remove(userId: string): Promise<void> {
    await this.db.delete(calendarCredentials).where(eq(calendarCredentials.userId, userId));
  }
}
