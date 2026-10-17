import { HttpClient, HttpEventType, type HttpDownloadProgressEvent } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, firstValueFrom, switchMap, tap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

export type ChatMessage = { role: 'user' | 'assistant'; text: string };
export type ChatConversation = { id: string; title: string; hasTitle: boolean };

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly messages = signal<ChatMessage[]>([]);
  readonly conversations = signal<ChatConversation[]>([]);
  readonly activeConversationId = signal<string | null>(null);
  readonly sending = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  // Outgoing sends route through a Subject + switchMap so a new send cancels
  // an in-flight stream if it's ever superseded, even though the UI also
  // disables input while `sending()` is true.
  private readonly sendRequests = new Subject<{ text: string; conversationId: string }>();

  constructor() {
    this.sendRequests
      .pipe(switchMap(({ text, conversationId }) => this.streamReply(text, conversationId)))
      .subscribe();
  }

  async loadConversations(): Promise<void> {
    this.loading.set(true);
    this.messages.set([]);
    this.activeConversationId.set(null);
    this.conversations.set([]);
    try {
      const conversations = await firstValueFrom(
        this.http.get<ChatConversation[]>(`${this.apiUrl}/chat/conversations`),
      );
      this.conversations.set(conversations);
      if (conversations.length) await this.loadHistory(conversations[0].id);
      this.error.set('');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load conversations.'));
    } finally {
      this.loading.set(false);
    }
  }

  async selectConversation(id: string): Promise<void> {
    if (this.loading() || this.sending() || id === this.activeConversationId()) return;
    this.loading.set(true);
    this.messages.set([]);
    this.activeConversationId.set(null);
    try {
      await this.loadHistory(id);
      this.error.set('');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not load chat history.'));
    } finally {
      this.loading.set(false);
    }
  }

  async startNewChat(): Promise<void> {
    if (this.loading() || this.sending()) return;
    this.loading.set(true);
    try {
      const conversation = await this.createConversation();
      this.conversations.update((list) => [conversation, ...list]);
      this.activeConversationId.set(conversation.id);
      this.messages.set([]);
      this.error.set('');
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not start a new chat.'));
    } finally {
      this.loading.set(false);
    }
  }

  send(text: string): Promise<boolean> {
    if (!text.trim() || this.sending() || this.loading()) return Promise.resolve(false);
    this.error.set('');
    this.sending.set(true);
    return this.beginSend(text);
  }

  private async beginSend(text: string): Promise<boolean> {
    let conversationId = this.activeConversationId();
    if (!conversationId) {
      try {
        const conversation = await this.createConversation();
        conversationId = conversation.id;
        this.conversations.update((list) => [conversation, ...list]);
        this.activeConversationId.set(conversationId);
      } catch (err) {
        this.error.set(errorMessage(err, 'Could not start a new chat.'));
        this.sending.set(false);
        return false;
      }
    }
    const id = conversationId;
    this.conversations.update((list) => {
      const current = list.find((conversation) => conversation.id === id);
      if (!current) return list;
      const updated = current.hasTitle
        ? current
        : { ...current, title: text.trim().slice(0, 80), hasTitle: true };
      return [updated, ...list.filter((conversation) => conversation.id !== id)];
    });
    this.messages.update((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    this.sendRequests.next({ text, conversationId: id });
    return true;
  }

  private createConversation(): Promise<ChatConversation> {
    return firstValueFrom(
      this.http.post<ChatConversation>(`${this.apiUrl}/chat/conversations`, {}),
    );
  }

  private async loadHistory(id: string): Promise<void> {
    const history = await firstValueFrom(
      this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/conversations/${id}/history`),
    );
    this.activeConversationId.set(id);
    this.messages.set(history);
  }

  private streamReply(text: string, conversationId: string) {
    let framesApplied = 0;

    return this.http
      .post(
        `${this.apiUrl}/chat`,
        { message: text, conversationId },
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
      const { delta } = JSON.parse(frame.slice('data: '.length)) as { delta?: string };
      if (delta !== undefined) this.appendDelta(delta);
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
