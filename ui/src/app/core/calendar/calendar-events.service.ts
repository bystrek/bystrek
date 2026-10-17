import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';
import { toLocalIso } from './local-iso';

export type CalendarEvent = {
  uid: string;
  summary: string;
  // ISO 8601 with an explicit UTC offset — see api/src/calendar/ical-event.ts.
  start: string;
  end: string;
  startWeekday: string;
  endWeekday: string;
  description: string | null;
  location: string | null;
  rrule: string | null;
};

@Injectable({ providedIn: 'root' })
export class CalendarEventsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  async getTimezone(): Promise<string> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ timezone: string }>(`${this.apiUrl}/calendar/events/timezone`),
      );
      return result.timezone;
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load your timezone.'));
    }
  }

  async listEvents(range: { start: Date; end: Date }): Promise<CalendarEvent[]> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ events: CalendarEvent[] }>(`${this.apiUrl}/calendar/events`, {
          params: { start: toLocalIso(range.start), end: toLocalIso(range.end) },
        }),
      );
      return result.events;
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load calendar events.'));
    }
  }

  async getEvent(uid: string, occurrence?: string): Promise<CalendarEvent> {
    try {
      return await firstValueFrom(
        this.http.get<CalendarEvent>(`${this.apiUrl}/calendar/events/${encodeURIComponent(uid)}`, {
          params: occurrence ? { occurrence } : {},
        }),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load this event.'));
    }
  }
}
