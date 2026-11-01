import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

export const SyncStatus = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  READY: 'ready',
  ERROR: 'error',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export type SyncProgress = {
  status: SyncStatus;
  fetched: number;
  total: number | null;
  error: string | null;
};

// Progress of the first download of the user's calendar into the API's local copy.
@Injectable({ providedIn: 'root' })
export class CalendarSyncService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  // Null when no calendar is connected (the API answers 400).
  async progress(): Promise<SyncProgress | null> {
    try {
      return await firstValueFrom(this.http.get<SyncProgress>(`${this.apiUrl}/calendar/sync`));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 400) return null;
      throw new Error(errorMessage(err, 'Could not check your calendar sync.'));
    }
  }

  // Restarts a failed download; objects already downloaded are kept.
  async retry(): Promise<SyncProgress> {
    try {
      return await firstValueFrom(this.http.post<SyncProgress>(`${this.apiUrl}/calendar/sync`, {}));
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not restart the calendar sync.'));
    }
  }
}
