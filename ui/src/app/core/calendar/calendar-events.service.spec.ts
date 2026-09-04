import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { CalendarEvent, CalendarEventsService } from './calendar-events.service';

const sampleEvent: CalendarEvent = {
  uid: 'e1',
  summary: 'Standup',
  start: '2026-09-04T08:30:00+02:00',
  end: '2026-09-04T09:00:00+02:00',
  startWeekday: 'Friday',
  endWeekday: 'Friday',
  description: null,
  location: null,
  rrule: null,
};

describe('CalendarEventsService', () => {
  let service: CalendarEventsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CalendarEventsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listEvents sends start/end as plain (no UTC offset) local ISO date-times', async () => {
    const pending = service.listEvents({
      start: new Date(2026, 8, 1, 0, 0, 0),
      end: new Date(2026, 8, 7, 23, 59, 59),
    });

    const req = httpMock.expectOne(
      (r) => r.url === '/api/calendar/events' && r.method === 'GET',
    );
    expect(req.request.params.get('start')).toBe('2026-09-01T00:00:00');
    expect(req.request.params.get('end')).toBe('2026-09-07T23:59:59');

    req.flush({ events: [sampleEvent] });
    expect(await pending).toEqual([sampleEvent]);
  });

  it('listEvents rejects with the server-provided message on failure', async () => {
    const pending = service.listEvents({ start: new Date(), end: new Date() });
    const req = httpMock.expectOne((r) => r.url === '/api/calendar/events');
    req.flush({ message: 'no calendar connected' }, { status: 400, statusText: 'Bad Request' });

    await expect(pending).rejects.toThrow('no calendar connected');
  });

  it('listEvents falls back to a generic message when the server sends none', async () => {
    const pending = service.listEvents({ start: new Date(), end: new Date() });
    const req = httpMock.expectOne((r) => r.url === '/api/calendar/events');
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    await expect(pending).rejects.toThrow('Could not load calendar events.');
  });

  it('getEvent URL-encodes the uid', async () => {
    const pending = service.getEvent('e/1 two');
    const req = httpMock.expectOne('/api/calendar/events/e%2F1%20two');
    req.flush(sampleEvent);
    expect(await pending).toEqual(sampleEvent);
  });

  it('getEvent rejects with a fallback message on failure', async () => {
    const pending = service.getEvent('missing');
    const req = httpMock.expectOne('/api/calendar/events/missing');
    req.flush('not found', { status: 404, statusText: 'Not Found' });

    await expect(pending).rejects.toThrow('Could not load this event.');
  });
});
