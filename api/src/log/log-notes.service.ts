import { Inject, Injectable } from '@nestjs/common';
import { type Db, DRIZZLE } from '../db/drizzle.provider';
import { notes } from '../db/schema';
import { EventSource } from './event-source';
import { LogCategoriesService } from './log-categories.service';
import { type LogEvent, LogEventsService } from './log-events.service';
import type { NewNoteDto } from './log.dto';

export interface Note {
  id: string;
  rawText: string;
  capturedAt: Date;
  events: LogEvent[];
}

// Saving a confirmed note: the note, its new categories and its events, all or nothing.
// The note is stored as typed and never changed afterwards.
@Injectable()
export class LogNotesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly categories: LogCategoriesService,
    private readonly events: LogEventsService,
  ) {}

  create(userId: string, input: NewNoteDto): Promise<Note> {
    return this.db.transaction(async (tx) => {
      const [note] = await tx
        .insert(notes)
        .values({ userId, rawText: input.rawText, capturedAt: input.capturedAt })
        .returning({ id: notes.id, rawText: notes.rawText, capturedAt: notes.capturedAt });

      const created = await this.categories.create(userId, input.newCategories, tx);
      await this.categories.assertOwned(
        userId,
        input.events.flatMap((event) => event.categoryId ?? []),
        tx,
      );

      const events = await this.events.insert(
        userId,
        input.events.map((event) => ({
          text: event.text,
          occurredAt: event.occurredAt,
          endsAt: event.endsAt ?? null,
          categoryId: event.newCategory
            ? created.get(event.newCategory)!
            : (event.categoryId ?? null),
          source: EventSource.Manual,
          noteId: note.id,
          extractorVersion: event.extractorVersion ?? null,
        })),
        tx,
      );
      return { ...note, events };
    });
  }
}
