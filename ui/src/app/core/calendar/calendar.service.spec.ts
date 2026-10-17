import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  let service: CalendarService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CalendarService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads calendars with saved credentials after the password field is cleared', async () => {
    const loaded = service.load();
    httpMock.expectOne('/api/calendar/credentials').flush({
      configured: true,
      caldavUrl: 'https://dav.example.com/',
      username: 'user',
      calendarUrl: null,
      calendarDisplayName: null,
    });
    await loaded;

    const preview = service.previewCalendars({
      caldavUrl: 'https://dav.example.com/',
      username: 'user',
      password: '',
    });
    const request = httpMock.expectOne('/api/calendar/credentials/calendars');
    expect(request.request.method).toBe('GET');
    request.flush({
      calendars: [{ url: 'https://dav.example.com/personal', displayName: 'Personal' }],
    });
    expect(await preview).toHaveLength(1);
  });

  it('previews an explicitly entered password without using the saved one', async () => {
    const preview = service.previewCalendars({
      caldavUrl: 'https://dav.example.com/',
      username: 'user',
      password: 'new password',
    });
    const request = httpMock.expectOne('/api/calendar/credentials/preview-calendars');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.password).toBe('new password');
    request.flush({ calendars: [] });
    expect(await preview).toEqual([]);
  });

  it('requires a password if the saved account details were changed', async () => {
    const loaded = service.load();
    httpMock.expectOne('/api/calendar/credentials').flush({
      configured: true,
      caldavUrl: 'https://dav.example.com/',
      username: 'user',
      calendarUrl: null,
      calendarDisplayName: null,
    });
    await loaded;

    await expect(
      service.previewCalendars({
        caldavUrl: 'https://dav.example.com/',
        username: 'different user',
        password: '',
      }),
    ).rejects.toThrow('Enter the password');
  });
});
