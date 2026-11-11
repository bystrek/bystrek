import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
}
