import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

// Where a logged event came from: typed in log mode, or imported from Apple Health.
export const DiaryEventSource = {
  MANUAL: 'manual',
  HEALTH: 'health',
} as const;

export type DiaryEventSource = (typeof DiaryEventSource)[keyof typeof DiaryEventSource];

// `occurredAt`/`endsAt` are UTC ISO instants. A point has no `endsAt`; a span has one.
export type DiaryEvent = {
  id: string;
  noteId: string | null;
  text: string;
  occurredAt: string;
  endsAt: string | null;
  source: DiaryEventSource;
  category: { id: string; name: string } | null;
};

export type DiaryCategory = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
};

// One event as POST /diary/notes takes it: an existing category (`categoryId`), one of the
// note's `newCategories` (`newCategory`, by name), or none.
export type NoteEvent = {
  text: string;
  occurredAt: string;
  endsAt: string | null;
  categoryId: string | null;
  newCategory?: string;
  extractorVersion: string | null;
};

export type NewCategory = { name: string; description: string | null };

export type NewDiaryNote = {
  rawText: string;
  capturedAt: string;
  events: NoteEvent[];
  newCategories: NewCategory[];
};

// Mirrors the API's DiaryDraftResponse (POST /diary/draft): a draft is confirmed, as edited,
// through POST /diary/notes.
export type DiaryDraft = { events: NoteEvent[]; newCategories: NewCategory[] };
export type DiaryDraftResponse =
  | ({ kind: 'draft' } & DiaryDraft)
  | { kind: 'nothing'; text: string }
  | { kind: 'text'; text: string };

// Matches the API's MAX_DRAFT_TEXT_LENGTH.
export const MAX_DRAFT_TEXT_LENGTH = 2000;

@Injectable({ providedIn: 'root' })
export class DiaryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  // Events overlapping [from, to); both bounds are instants with an offset.
  async listEvents(from: string, to: string): Promise<DiaryEvent[]> {
    try {
      return await firstValueFrom(
        this.http.get<DiaryEvent[]>(`${this.apiUrl}/diary/events`, { params: { from, to } }),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load logged events.'));
    }
  }

  listCategories(): Promise<DiaryCategory[]> {
    return firstValueFrom(this.http.get<DiaryCategory[]>(`${this.apiUrl}/diary/categories`));
  }

  // Nothing is saved. Cold, so a draft can be cancelled.
  draft(text: string, capturedAt: string): Observable<DiaryDraftResponse> {
    return this.http.post<DiaryDraftResponse>(`${this.apiUrl}/diary/draft`, { text, capturedAt });
  }

  async createNote(note: NewDiaryNote): Promise<DiaryEvent[]> {
    try {
      const saved = await firstValueFrom(
        this.http.post<{ events: DiaryEvent[] }>(`${this.apiUrl}/diary/notes`, note),
      );
      return saved.events;
    } catch (err) {
      throw new Error(errorMessage(err, "Couldn't log that. Try again."));
    }
  }
}
