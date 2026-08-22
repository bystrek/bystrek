import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { households, users } from '../db/schema';
import { AUTH } from '../auth/auth.provider';
import type { Auth } from '../auth/auth.config';
import { UI_URL } from '../env';

@Injectable()
export class HouseholdService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  private async getSingleHousehold() {
    const [household] = await this.db
      .select()
      .from(households)
      .orderBy(asc(households.createdAt))
      .limit(1);
    return household ?? null;
  }

  async getHousehold() {
    const household = await this.getSingleHousehold();
    if (!household) return null;

    const members = await this.db
      .select({
        id: users.id,
        name: users.name,
        status: users.status,
        banned: users.banned,
      })
      .from(users)
      .where(eq(users.householdId, household.id));

    return { name: household.name, members };
  }

  async invite(email: string, name: string, headers: Headers) {
    const household = await this.getSingleHousehold();
    if (!household) {
      throw new NotFoundException('no household configured');
    }

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      throw new ConflictException('a user with that email already exists');
    }

    const [member] = await this.db
      .insert(users)
      .values({ householdId: household.id, email, name })
      .returning();

    // Reuses the regular forgot-password flow: the invitee's first email
    // is "set your password", same code path as a normal reset.
    await this.auth.api.requestPasswordReset({
      body: { email, redirectTo: `${UI_URL}/auth/reset-password` },
      headers,
    });

    return member;
  }

  async setBanned(userId: string, banned: boolean, headers: Headers) {
    if (banned) {
      await this.auth.api.banUser({ body: { userId }, headers });
    } else {
      await this.auth.api.unbanUser({ body: { userId }, headers });
    }
  }
}
