import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, or } from 'drizzle-orm';
import { type Db, DRIZZLE, type Tx } from '../db/drizzle.provider';
import { categories, events } from '../db/schema';
import type { EventSource } from './event-source';
import { LogCategoriesService } from './log-categories.service';
import { type EventPatchDto, isValidSpan } from './log.dto';
import { EventNotFoundError, InvalidSpanError } from './log.errors';

export interface LogEvent {
  id: string;
  noteId: string | null;
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  source: EventSource;
  category: { id: string; name: string } | null;
}

// What gets stored for one event; the category is already resolved to one of the user's.
export interface NewEvent {
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  categoryId: string | null;
  source: EventSource;
  noteId: string | null;
  extractorVersion: string | null;
}

// The user's own events. Another user's event answers as not found.
@Injectable()
export class LogEventsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly categories: LogCategoriesService,
  ) {}

  // Events overlapping [from, to): points inside it, spans that start before `to` and end
  // after `from`. Oldest first.
  list(userId: string, range: { from: Date; to: Date }): Promise<LogEvent[]> {
    return this.select(this.db)
      .where(
        and(
          eq(events.userId, userId),
          lt(events.occurredAt, range.to),
          or(gte(events.occurredAt, range.from), gt(events.endsAt, range.from)),
        ),
      )
      .orderBy(asc(events.occurredAt), asc(events.id));
  }

  async insert(userId: string, rows: NewEvent[], db: Db | Tx = this.db): Promise<LogEvent[]> {
    const inserted = await db
      .insert(events)
      .values(rows.map((row) => ({ ...row, userId })))
      .returning({ id: events.id });
    return this.select(db)
      .where(
        inArray(
          events.id,
          inserted.map((row) => row.id),
        ),
      )
      .orderBy(asc(events.occurredAt), asc(events.id));
  }

  async update(userId: string, id: string, patch: EventPatchDto): Promise<LogEvent> {
    const [current] = await this.db
      .select({ occurredAt: events.occurredAt, endsAt: events.endsAt })
      .from(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)));
    if (!current) throw new EventNotFoundError(id);
    const occurredAt = patch.occurredAt ?? current.occurredAt;
    const endsAt = patch.endsAt === undefined ? current.endsAt : patch.endsAt;
    if (!isValidSpan(occurredAt, endsAt)) throw new InvalidSpanError();
    if (patch.categoryId) await this.categories.assertOwned(userId, [patch.categoryId]);

    // Drizzle rejects an empty `set`; an empty patch changes nothing.
    if (Object.keys(patch).length) {
      await this.db
        .update(events)
        .set(patch)
        .where(and(eq(events.id, id), eq(events.userId, userId)));
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)))
      .returning({ id: events.id });
    if (!deleted.length) throw new EventNotFoundError(id);
  }

  private async get(userId: string, id: string): Promise<LogEvent> {
    const [event] = await this.select(this.db).where(
      and(eq(events.id, id), eq(events.userId, userId)),
    );
    if (!event) throw new EventNotFoundError(id);
    return event;
  }

  private select(db: Db | Tx) {
    return db
      .select({
        id: events.id,
        noteId: events.noteId,
        text: events.text,
        occurredAt: events.occurredAt,
        endsAt: events.endsAt,
        source: events.source,
        category: { id: categories.id, name: categories.name },
      })
      .from(events)
      .leftJoin(categories, eq(categories.id, events.categoryId))
      .$dynamic();
  }
}
