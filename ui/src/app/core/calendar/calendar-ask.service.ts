import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

export type AskEvent = {
  uid: string;
  title: string;
  start: string;
  end: string;
  startWeekday: string;
  durationMinutes: number;
};

export type AskResponse =
  | { kind: 'event'; event: AskEvent }
  | { kind: 'availability'; busy: boolean; text: string; conflicts: AskEvent[] }
  | { kind: 'list'; text: string; events: AskEvent[] }
  | { kind: 'text'; text: string }
  | { kind: 'cant_do'; text: string };

// Returns a cold observable so the caller can cancel an in-flight question.
@Injectable({ providedIn: 'root' })
export class CalendarAskService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  ask(question: string): Observable<AskResponse> {
    return this.http.post<AskResponse>(`${this.apiUrl}/calendar/ask`, { question });
  }
}
