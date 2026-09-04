import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

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

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string } | null;
    return body?.message ?? fallback;
  }
  return fallback;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Formats as a plain (no UTC offset) ISO date-time — the API interprets
// this as wall-clock time in the requesting user's own stored timezone
// (see api/src/calendar/zoned-time.ts:parseZonedIso), same convention
// chat's calendar tool calls already use.
function toLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

@Injectable({ providedIn: 'root' })
export class CalendarEventsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

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

  async getEvent(uid: string): Promise<CalendarEvent> {
    try {
      return await firstValueFrom(
        this.http.get<CalendarEvent>(`${this.apiUrl}/calendar/events/${encodeURIComponent(uid)}`),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load this event.'));
    }
  }
}
