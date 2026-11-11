import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, or } from 'drizzle-orm';
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
