import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { places, placeVisits } from '../db/schema';
import { PlaceNotFoundError } from './places.errors';

// "Visited" is per user; marking and unmarking are both idempotent.
@Injectable()
export class PlaceVisitsService {
  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {}

  async mark(userId: string, placeId: string): Promise<void> {
    const [place] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(eq(places.id, placeId));
    if (!place) throw new PlaceNotFoundError(placeId);
    await this.db.insert(placeVisits).values({ userId, placeId }).onConflictDoNothing();
  }

  async unmark(userId: string, placeId: string): Promise<void> {
    await this.db
      .delete(placeVisits)
      .where(and(eq(placeVisits.userId, userId), eq(placeVisits.placeId, placeId)));
  }
}
