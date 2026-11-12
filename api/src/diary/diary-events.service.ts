import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { type Db, DRIZZLE, type Tx } from '../db/drizzle.provider';
import { diaryCategories, diaryEvents } from '../db/schema';
import type { DiaryEventSource } from './diary-event-source';
import { DiaryCategoriesService } from './diary-categories.service';
import { type DiaryEventPatchDto, isValidSpan } from './diary.dto';
import { DiaryEventNotFoundError, InvalidSpanError } from './diary.errors';

export interface DiaryEvent {
  id: string;
  noteId: string | null;
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  source: DiaryEventSource;
  category: { id: string; name: string } | null;
}

// What gets stored for one event; the category is already resolved to one of the user's.
export interface NewDiaryEvent {
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  categoryId: string | null;
  source: DiaryEventSource;
  noteId: string | null;
  extractorVersion: string | null;
}

// An event from an import, identified within its source by `externalId`.
export interface ImportedDiaryEvent {
  externalId: string;
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  categoryId: string | null;
  quantity: number | null;
  unit: string | null;
}

// Rows per insert, well under Postgres's 65535 bind parameters for a backfill of years.
const UPSERT_CHUNK = 1000;

// The user's own diaryEvents. Another user's event answers as not found.
@Injectable()
export class DiaryEventsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly categories: DiaryCategoriesService,
  ) {}

  // Events overlapping [from, to): points inside it, spans that start before `to` and end
  // after `from`. Oldest first.
  list(userId: string, range: { from: Date; to: Date }): Promise<DiaryEvent[]> {
    return this.select(this.db)
      .where(
        and(
          eq(diaryEvents.userId, userId),
          lt(diaryEvents.occurredAt, range.to),
          or(gte(diaryEvents.occurredAt, range.from), gt(diaryEvents.endsAt, range.from)),
        ),
      )
      .orderBy(asc(diaryEvents.occurredAt), asc(diaryEvents.id));
  }

  async insert(
    userId: string,
    rows: NewDiaryEvent[],
    db: Db | Tx = this.db,
  ): Promise<DiaryEvent[]> {
    const inserted = await db
      .insert(diaryEvents)
      .values(rows.map((row) => ({ ...row, userId })))
      .returning({ id: diaryEvents.id });
    return this.select(db)
      .where(
        inArray(
          diaryEvents.id,
          inserted.map((row) => row.id),
        ),
      )
      .orderBy(asc(diaryEvents.occurredAt), asc(diaryEvents.id));
  }

  // Inserts imported events, or updates the ones `source` already sent under the same
  // `externalId`. An update keeps the event's category, which the user may have changed.
  // A later row with the same `externalId` wins. Returns how many rows were written.
  async upsertImported(
    userId: string,
    source: DiaryEventSource,
    rows: ImportedDiaryEvent[],
    db: Db | Tx = this.db,
  ): Promise<number> {
    const unique = [...new Map(rows.map((row) => [row.externalId, row])).values()];
    for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
      await db
        .insert(diaryEvents)
        .values(unique.slice(i, i + UPSERT_CHUNK).map((row) => ({ ...row, userId, source })))
        .onConflictDoUpdate({
          target: [diaryEvents.userId, diaryEvents.source, diaryEvents.externalId],
          set: {
            text: sql`excluded.text`,
            occurredAt: sql`excluded.occurred_at`,
            endsAt: sql`excluded.ends_at`,
            quantity: sql`excluded.quantity`,
            unit: sql`excluded.unit`,
            updatedAt: sql`now()`,
          },
        });
    }
    return unique.length;
  }

  async update(userId: string, id: string, patch: DiaryEventPatchDto): Promise<DiaryEvent> {
    const [current] = await this.db
      .select({ occurredAt: diaryEvents.occurredAt, endsAt: diaryEvents.endsAt })
      .from(diaryEvents)
      .where(and(eq(diaryEvents.id, id), eq(diaryEvents.userId, userId)));
    if (!current) throw new DiaryEventNotFoundError(id);
    const occurredAt = patch.occurredAt ?? current.occurredAt;
    const endsAt = patch.endsAt === undefined ? current.endsAt : patch.endsAt;
    if (!isValidSpan(occurredAt, endsAt)) throw new InvalidSpanError();
    if (patch.categoryId) await this.categories.assertOwned(userId, [patch.categoryId]);

    // Drizzle rejects an empty `set`; an empty patch changes nothing.
    if (Object.keys(patch).length) {
      await this.db
        .update(diaryEvents)
        .set(patch)
        .where(and(eq(diaryEvents.id, id), eq(diaryEvents.userId, userId)));
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(diaryEvents)
      .where(and(eq(diaryEvents.id, id), eq(diaryEvents.userId, userId)))
      .returning({ id: diaryEvents.id });
    if (!deleted.length) throw new DiaryEventNotFoundError(id);
  }

  private async get(userId: string, id: string): Promise<DiaryEvent> {
    const [event] = await this.select(this.db).where(
      and(eq(diaryEvents.id, id), eq(diaryEvents.userId, userId)),
    );
    if (!event) throw new DiaryEventNotFoundError(id);
    return event;
  }

  private select(db: Db | Tx) {
    return db
      .select({
        id: diaryEvents.id,
        noteId: diaryEvents.noteId,
        text: diaryEvents.text,
        occurredAt: diaryEvents.occurredAt,
        endsAt: diaryEvents.endsAt,
        source: diaryEvents.source,
        category: { id: diaryCategories.id, name: diaryCategories.name },
      })
      .from(diaryEvents)
      .leftJoin(diaryCategories, eq(diaryCategories.id, diaryEvents.categoryId))
      .$dynamic();
  }
}
