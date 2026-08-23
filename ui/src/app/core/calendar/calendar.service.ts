import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CalendarCredentialsSummary = {
  configured: boolean;
  caldavUrl: string | null;
  username: string | null;
  calendarName: string | null;
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string } | null;
    return body?.message ?? fallback;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);

  readonly credentials = signal<CalendarCredentialsSummary | null>(null);
  readonly busy = signal(false);

  async load(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<CalendarCredentialsSummary>(`${environment.apiUrl}/calendar/credentials`),
      );
      this.credentials.set(result);
    } catch {
      this.credentials.set(null);
    }
  }

  async save(input: {
    caldavUrl: string;
    username: string;
    password: string;
    calendarName: string;
  }): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.put(`${environment.apiUrl}/calendar/credentials`, {
          caldavUrl: input.caldavUrl,
          username: input.username,
          password: input.password,
          calendarName: input.calendarName || undefined,
        }),
      );
      await this.load();
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not save calendar settings.'));
    } finally {
      this.busy.set(false);
    }
  }

  async disconnect(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.delete(`${environment.apiUrl}/calendar/credentials`));
      await this.load();
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not disconnect the calendar.'));
    } finally {
      this.busy.set(false);
    }
  }
}
