import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const first = { id: 'first-id', title: 'First chat', hasTitle: true };
  const second = { id: 'second-id', title: 'Second chat', hasTitle: true };

  async function loadFirst() {
    const pending = service.loadConversations();
    httpMock.expectOne('/api/chat/conversations').flush([first, second]);
    await Promise.resolve();
    httpMock.expectOne('/api/chat/conversations/first-id/history').flush([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
    await pending;
  }

  it('loads conversations and the latest history', async () => {
    await loadFirst();

    expect(service.conversations()).toEqual([first, second]);
    expect(service.activeConversationId()).toBe(first.id);
    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
  });

  it('switches histories without mixing messages', async () => {
    await loadFirst();
    const pending = service.selectConversation(second.id);
    expect(service.messages()).toEqual([]);
    httpMock
      .expectOne('/api/chat/conversations/second-id/history')
      .flush([{ role: 'user', text: 'separate' }]);
    await pending;
    expect(service.activeConversationId()).toBe(second.id);
    expect(service.messages()).toEqual([{ role: 'user', text: 'separate' }]);
  });

  it('starts a new chat without deleting prior conversations', async () => {
    await loadFirst();
    const pending = service.startNewChat();
    httpMock
      .expectOne('/api/chat/conversations')
      .flush({ id: 'new-id', title: 'New chat', hasTitle: false });
    await pending;
    expect(service.conversations().map((conversation) => conversation.id)).toEqual([
      'new-id',
      'first-id',
      'second-id',
    ]);
    expect(service.messages()).toEqual([]);
  });

  it('send appends the user message and a trailing assistant placeholder, then streams deltas into it', async () => {
    service.send('hi there');

    httpMock
      .expectOne('/api/chat/conversations')
      .flush({ id: 'new-id', title: 'New chat', hasTitle: false });
    await Promise.resolve();
    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi there' },
      { role: 'assistant', text: '' },
    ]);
    expect(service.sending()).toBe(true);

    const req = httpMock.expectOne(`/api/chat`);
    expect(req.request.body).toEqual({ message: 'hi there', conversationId: 'new-id' });

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 10,
      partialText: 'data: {"delta":"Hel"}\n\n',
    });
    expect(service.messages()[1].text).toBe('Hel');

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 20,
      partialText: 'data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\n',
    });
    expect(service.messages()[1].text).toBe('Hello');

    req.flush('data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\n');

    expect(service.sending()).toBe(false);
    expect(service.messages()[1].text).toBe('Hello');
  });

  it('ignores an incomplete trailing frame until it is completed by a later event', async () => {
    await loadFirst();
    service.send('hi');
    const req = httpMock.expectOne(`/api/chat`);

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 5,
      partialText: 'data: {"delta":"Hel',
    });
    expect(service.messages().at(-1)?.text).toBe('');

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 10,
      partialText: 'data: {"delta":"Hel"}\n\n',
    });
    expect(service.messages().at(-1)?.text).toBe('Hel');

    req.flush('data: {"delta":"Hel"}\n\n');
  });

  it('ignores a metadata-only completion frame', async () => {
    await loadFirst();
    service.send('hi');
    const req = httpMock.expectOne(`/api/chat`);

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 10,
      partialText: 'data: {"delta":"Hello"}\n\ndata: {"done":true,"toolCalls":[]}\n\n',
    });

    expect(service.messages().at(-1)?.text).toBe('Hello');
    req.flush('data: {"delta":"Hello"}\n\ndata: {"done":true,"toolCalls":[]}\n\n');
  });

  it('send is a no-op while a stream is already in flight', async () => {
    await loadFirst();
    service.send('first');
    httpMock.expectOne(`/api/chat`);

    service.send('second');
    httpMock.expectNone((r) => r.body?.message === 'second');
    expect(service.messages().length).toBe(4);
  });

  it('does not switch conversations while a stream is in flight', async () => {
    await loadFirst();
    service.send('hi');
    const pending = service.selectConversation(second.id);
    await pending;
    httpMock.expectNone('/api/chat/conversations/second-id/history');
    expect(service.activeConversationId()).toBe(first.id);
    httpMock.expectOne('/api/chat').flush('');
  });

  it('clears a stale error once conversations load', async () => {
    service.error.set('previous failure');

    const pending = service.loadConversations();
    httpMock.expectOne('/api/chat/conversations').flush([]);
    await pending;

    expect(service.error()).toBe('');
  });

  it('sets an error and clears sending when the request fails', async () => {
    await loadFirst();
    // `responseType: 'text'` means a failed response body never gets
    // JSON-parsed, so this always falls back to the generic message.
    service.send('hi');

    const req = httpMock.expectOne(`/api/chat`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    expect(service.sending()).toBe(false);
    expect(service.error()).toBe('Something went wrong.');
  });

  it('keeps messages empty when creating the first conversation fails', async () => {
    service.send('hi');
    httpMock
      .expectOne('/api/chat/conversations')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await Promise.resolve();
    expect(service.sending()).toBe(false);
    expect(service.messages()).toEqual([]);
    expect(service.error()).toBe('Could not start a new chat.');
  });
});
