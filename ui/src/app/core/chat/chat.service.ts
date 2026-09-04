import {
  HttpClient,
  HttpEventType,
  type HttpDownloadProgressEvent,
} from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, firstValueFrom, switchMap, tap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

export type ChatMessage = { role: 'user' | 'assistant'; text: string };

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly messages = signal<ChatMessage[]>([]);
  readonly sending = signal(false);
  readonly error = signal('');

  // Outgoing sends route through a Subject + switchMap so a new send cancels
  // an in-flight stream if it's ever superseded, even though the UI also
  // disables input while `sending()` is true.
  private readonly sendRequests = new Subject<string>();

  constructor() {
    this.sendRequests.pipe(switchMap((text) => this.streamReply(text))).subscribe();
  }

  async loadHistory(): Promise<void> {
    try {
      const history = await firstValueFrom(
        this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/history`),
      );
      // Only apply if nothing has been sent yet — a send() that started
      // while this request was in flight already owns `messages`, and
      // overwriting it here would wipe the pending user/assistant turns
      // out from under an in-progress stream.
      if (this.messages().length === 0) {
        this.messages.set(history);
      }
      this.error.set('');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load chat history.'));
    }
  }

  send(text: string): void {
    if (!text.trim() || this.sending()) return;
    this.error.set('');
    this.sending.set(true);
    this.messages.update((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    this.sendRequests.next(text);
  }

  private streamReply(text: string) {
    let framesApplied = 0;

    return this.http
      .post(
        `${this.apiUrl}/chat`,
        { message: text },
        { observe: 'events', responseType: 'text', reportProgress: true },
      )
      .pipe(
        tap((event) => {
          if (event.type === HttpEventType.DownloadProgress) {
            const partialText = (event as HttpDownloadProgressEvent).partialText ?? '';
            framesApplied = this.applyFrames(partialText, framesApplied);
          } else if (event.type === HttpEventType.Response) {
            this.sending.set(false);
          }
        }),
        catchError((err: unknown) => {
          this.error.set(errorMessage(err, 'Something went wrong.'));
          this.sending.set(false);
          return EMPTY;
        }),
      );
  }

  // `partialText` is the full response accumulated so far (not a delta), so
  // frames already applied are re-derived and skipped rather than tracked
  // via a separate buffer. The final element after splitting on the frame
  // separator is always incomplete (or empty, if the text ends exactly on a
  // separator) and is left for the next event.
  private applyFrames(partialText: string, framesApplied: number): number {
    const frames = partialText.split('\n\n');
    const completeCount = frames.length - 1;
    for (let i = framesApplied; i < completeCount; i++) {
      const frame = frames[i];
      if (!frame.startsWith('data: ')) continue;
      const { delta } = JSON.parse(frame.slice('data: '.length)) as { delta: string };
      this.appendDelta(delta);
    }
    return completeCount;
  }

  private appendDelta(delta: string): void {
    this.messages.update((m) => {
      const last = m[m.length - 1];
      return [...m.slice(0, -1), { ...last, text: last.text + delta }];
    });
  }
}
