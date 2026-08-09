import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { households, users } from '../db/schema';

@Injectable()
export class HouseholdService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async getHousehold() {
    const [household] = await this.db
      .select()
      .from(households)
      .orderBy(asc(households.createdAt))
      .limit(1);
    if (!household) return null;

    const members = await this.db
      .select({ name: users.name, status: users.status })
      .from(users)
      .where(eq(users.householdId, household.id));

    return { name: household.name, members };
  }
}
