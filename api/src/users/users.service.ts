import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { users } from '../db/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {}

  async listUsers() {
    return this.db.select({ id: users.id, name: users.name }).from(users);
  }

  // The user's IANA time zone, for reading "at 7" or "yesterday" the way they meant it.
  async timeZone(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new NotFoundException(`user ${userId} not found`);
    return row.timezone;
  }
}
