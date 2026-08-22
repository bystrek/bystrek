import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loadHistory populates messages from GET /chat/history', async () => {
    const pending = service.loadHistory();

    const req = httpMock.expectOne(`${environment.apiUrl}/chat/history`);
    req.flush([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
    await pending;

    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
  });

  it('send appends the user message and a trailing assistant placeholder, then streams deltas into it', async () => {
    service.send('hi there');

    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi there' },
      { role: 'assistant', text: '' },
    ]);
    expect(service.sending()).toBe(true);

    const req = httpMock.expectOne(`${environment.apiUrl}/chat`);
    expect(req.request.body).toEqual({ message: 'hi there' });

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

  it('ignores an incomplete trailing frame until it is completed by a later event', () => {
    service.send('hi');
    const req = httpMock.expectOne(`${environment.apiUrl}/chat`);

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 5,
      partialText: 'data: {"delta":"Hel',
    });
    expect(service.messages()[1].text).toBe('');

    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 10,
      partialText: 'data: {"delta":"Hel"}\n\n',
    });
    expect(service.messages()[1].text).toBe('Hel');

    req.flush('data: {"delta":"Hel"}\n\n');
  });

  it('send is a no-op while a stream is already in flight', () => {
    service.send('first');
    httpMock.expectOne(`${environment.apiUrl}/chat`);

    service.send('second');
    httpMock.expectNone((r) => r.body?.message === 'second');
    expect(service.messages().length).toBe(2);
  });

  it('does not let a slow loadHistory clobber messages appended by a send that started first', async () => {
    const pending = service.loadHistory();
    const historyReq = httpMock.expectOne(`${environment.apiUrl}/chat/history`);

    service.send('hi there');
    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi there' },
      { role: 'assistant', text: '' },
    ]);

    historyReq.flush([{ role: 'user', text: 'stale history' }]);
    await pending;

    expect(service.messages()).toEqual([
      { role: 'user', text: 'hi there' },
      { role: 'assistant', text: '' },
    ]);

    httpMock.expectOne(`${environment.apiUrl}/chat`).flush('');
  });

  it('clears a stale error once loadHistory succeeds', async () => {
    service.error.set('previous failure');

    const pending = service.loadHistory();
    httpMock.expectOne(`${environment.apiUrl}/chat/history`).flush([]);
    await pending;

    expect(service.error()).toBe('');
  });

  it('sets an error and clears sending when the request fails', () => {
    // `responseType: 'text'` means a failed response body never gets
    // JSON-parsed, so this always falls back to the generic message.
    service.send('hi');

    const req = httpMock.expectOne(`${environment.apiUrl}/chat`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    expect(service.sending()).toBe(false);
    expect(service.error()).toBe('Something went wrong.');
  });
});
