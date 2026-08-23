import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { users } from '../db/schema';
import { AUTH } from '../auth/auth.provider';
import type { Auth } from '../auth/auth.config';
import { UI_URL } from '../env';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async listUsers() {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        status: users.status,
        banned: users.banned,
      })
      .from(users);
  }

  async invite(email: string, name: string, headers: Headers) {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      throw new ConflictException('a user with that email already exists');
    }

    const [user] = await this.db.insert(users).values({ email, name }).returning();

    // Reuses the regular forgot-password flow: the invitee's first email
    // is "set your password", same code path as a normal reset.
    await this.auth.api.requestPasswordReset({
      body: { email, redirectTo: `${UI_URL}/auth/reset-password` },
      headers,
    });

    return user;
  }

  async setBanned(userId: string, banned: boolean, headers: Headers) {
    if (banned) {
      await this.auth.api.banUser({ body: { userId }, headers });
    } else {
      await this.auth.api.unbanUser({ body: { userId }, headers });
    }
  }
}
