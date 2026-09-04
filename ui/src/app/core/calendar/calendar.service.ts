import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

export type CalendarCredentialsSummary = {
  configured: boolean;
  caldavUrl: string | null;
  username: string | null;
  calendarUrl: string | null;
  calendarDisplayName: string | null;
};

export type CalendarOption = {
  url: string;
  displayName: string | null;
};

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly credentials = signal<CalendarCredentialsSummary | null>(null);
  readonly busy = signal(false);

  async load(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<CalendarCredentialsSummary>(`${this.apiUrl}/calendar/credentials`),
      );
      this.credentials.set(result);
    } catch {
      this.credentials.set(null);
    }
  }

  // Connects with the given (not-yet-saved) credentials and lists the
  // account's calendars — doesn't touch stored credentials at all, just
  // lets the form offer a dropdown before Save.
  async previewCalendars(input: {
    caldavUrl: string;
    username: string;
    password: string;
  }): Promise<CalendarOption[]> {
    try {
      const result = await firstValueFrom(
        this.http.post<{ calendars: CalendarOption[] }>(
          `${this.apiUrl}/calendar/credentials/preview-calendars`,
          input,
        ),
      );
      return result.calendars;
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not connect to load calendars.'));
    }
  }

  async save(input: {
    caldavUrl: string;
    username: string;
    password: string;
    calendarUrl: string | null;
    calendarDisplayName: string | null;
  }): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/calendar/credentials`, {
          caldavUrl: input.caldavUrl,
          username: input.username,
          password: input.password,
          calendarUrl: input.calendarUrl ?? undefined,
          calendarDisplayName: input.calendarDisplayName ?? undefined,
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
      await firstValueFrom(this.http.delete(`${this.apiUrl}/calendar/credentials`));
      await this.load();
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not disconnect the calendar.'));
    } finally {
      this.busy.set(false);
    }
  }
}
