import { Inject, Injectable } from '@nestjs/common';
import { type Db, DRIZZLE, type Tx } from '../db/drizzle.provider';
import { healthImports } from '../db/schema';

// Raw Health Auto Export pushes, stored exactly as received and never modified.
@Injectable()
export class HealthImportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async store(userId: string, payload: unknown, db: Db | Tx = this.db): Promise<string> {
    const [row] = await db
      .insert(healthImports)
      .values({ userId, payload })
      .returning({ id: healthImports.id });
    return row.id;
  }
}
