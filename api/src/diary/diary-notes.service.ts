import { Inject, Injectable } from '@nestjs/common';
import { type Db, DRIZZLE } from '../db/drizzle.provider';
import { diaryNotes } from '../db/schema';
import { DiaryEventSource } from './diary-event-source';
import { DiaryCategoriesService } from './diary-categories.service';
import { type DiaryEvent, DiaryEventsService } from './diary-events.service';
import type { NewDiaryNoteDto } from './diary.dto';

export interface DiaryNote {
  id: string;
  rawText: string;
  capturedAt: Date;
  events: DiaryEvent[];
}

// Saving a confirmed note: the note, its new categories and its events, all or nothing.
// The note is stored as typed and never changed afterwards.
@Injectable()
export class DiaryNotesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly categories: DiaryCategoriesService,
    private readonly events: DiaryEventsService,
  ) {}

  create(userId: string, input: NewDiaryNoteDto): Promise<DiaryNote> {
    return this.db.transaction(async (tx) => {
      const [note] = await tx
        .insert(diaryNotes)
        .values({ userId, rawText: input.rawText, capturedAt: input.capturedAt })
        .returning({
          id: diaryNotes.id,
          rawText: diaryNotes.rawText,
          capturedAt: diaryNotes.capturedAt,
        });

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
          source: DiaryEventSource.Manual,
          noteId: note.id,
          extractorVersion: event.extractorVersion ?? null,
        })),
        tx,
      );
      return { ...note, events };
    });
  }
}
