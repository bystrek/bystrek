import { Inject, Injectable } from '@nestjs/common';
import { type Db, DRIZZLE } from '../db/drizzle.provider';
import { DiaryCategoriesService } from '../diary/diary-categories.service';
import { DiaryEventSource } from '../diary/diary-event-source';
import { DiaryEventsService } from '../diary/diary-events.service';
import { HealthImportsService } from './health-imports.service';
import type { HealthImportDto } from './health-import.dto';
import { mapHealthData } from './health-mappers';

export interface HealthImportResult {
  importId: string;
  // Events inserted or updated.
  events: number;
  // Entries of a mapped type that didn't parse; they stay only in the raw payload.
  skipped: number;
}

// One push: store it as received, map what has a mapper, file each event under its fixed
// category and upsert it. All or nothing, so a failed push can simply be re-sent.
@Injectable()
export class HealthImportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly imports: HealthImportsService,
    private readonly categories: DiaryCategoriesService,
    private readonly events: DiaryEventsService,
  ) {}

  // `payload` keeps every field it was sent with, so it's stored as received.
  import(userId: string, payload: HealthImportDto): Promise<HealthImportResult> {
    const { events, skipped } = mapHealthData(payload.data);
    return this.db.transaction(async (tx) => {
      const importId = await this.imports.store(userId, payload, tx);
      const names = [...new Set(events.map((event) => event.category))];
      const categoryIds = await this.categories.create(
        userId,
        names.map((name) => ({ name })),
        tx,
      );
      const written = await this.events.upsertImported(
        userId,
        DiaryEventSource.Health,
        events.map(({ category, ...event }) => ({
          ...event,
          categoryId: categoryIds.get(category) ?? null,
        })),
        tx,
      );
      return { importId, events: written, skipped };
    });
  }
}
