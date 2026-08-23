import { describe, expect, it, mock } from 'bun:test';
import type {
  CalendarCredentials,
  CalendarCredentialsService,
} from './calendar-credentials.service';

interface FakeCalendarObject {
  url: string;
  data: string;
}

interface FakeDAVCalendar {
  url: string;
  displayName: string;
}

const fakeCalendar: FakeDAVCalendar = {
  url: 'https://dav.example.com/cal/personal/',
  displayName: 'Personal',
};

function icsFor(uid: string, summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    'DTSTART:20260901T100000Z',
    'DTEND:20260901T110000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function fakeCredentials(overrides: Partial<CalendarCredentials> = {}): CalendarCredentialsService {
  const creds: CalendarCredentials = {
    caldavUrl: 'https://dav.example.com',
    username: 'user',
    password: 'pass',
    calendarUrl: null,
    ...overrides,
  };
  return { getInternal: () => Promise.resolve(creds) } as unknown as CalendarCredentialsService;
}

interface FakeClient {
  fetchCalendars: () => Promise<FakeDAVCalendar[]>;
  fetchCalendarObjects: (params: unknown) => Promise<FakeCalendarObject[]>;
}

// tsdav is mocked at the module level so CalendarService's actual CalDAV
// boundary logic (calendar selection, UID-based lookup, not just the ICS
// helpers) gets exercised — see devlog day 12: the UID-by-filename bug this
// catches would have passed CI with only mocked-tool-handler tests.
async function loadCalendarModule(createClient: () => Promise<FakeClient>) {
  await mock.module('tsdav', () => ({ createDAVClient: createClient }));
  // Dynamic `import()` resolves to `any` under this project's
  // sourceType:'commonjs' ESLint config vs. tsconfig's module:'nodenext' —
  // a tooling mismatch, not an actual unsafe value (the explicit type
  // annotation above doesn't clear it, since the rule checks the source
  // expression's inferred type, not the assignment target).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const calendarServiceModule: typeof import('./calendar.service') =
    await import('./calendar.service');
  return calendarServiceModule;
}

async function loadCalendarService(
  createClient: () => Promise<FakeClient>,
  credentials: CalendarCredentialsService,
) {
  const { CalendarService } = await loadCalendarModule(createClient);
  return new CalendarService(credentials);
}

describe('CalendarService', () => {
  it('finds an event by its actual iCalendar UID, not by resource filename', async () => {
    // Deliberately named so the filename does NOT contain the UID —
    // reproduces the bug where matching by `${uid}.ics` silently failed
    // for events not created by this service.
    const objects: FakeCalendarObject[] = [
      {
        url: 'https://dav.example.com/cal/personal/imported-event-1.ics',
        data: icsFor('real-uid-1', 'Dentist'),
      },
    ];
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve(objects),
        }),
      fakeCredentials(),
    );

    const event = await service.getEvent('user-1', 'real-uid-1', 'UTC');
    expect(event.summary).toBe('Dentist');
  });

  it('formats getEvent/listEvents times in the requested timezone, not raw UTC', async () => {
    // DTSTART/DTEND in icsFor are 10:00/11:00 UTC — confirms the timezone
    // argument is actually applied, not just accepted and ignored.
    const objects: FakeCalendarObject[] = [
      { url: 'https://dav.example.com/cal/personal/e.ics', data: icsFor('e1', 'Standup') },
    ];
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve(objects),
        }),
      fakeCredentials(),
    );

    const event = await service.getEvent('user-1', 'e1', 'Europe/Warsaw');
    expect(event.start).toBe('2026-09-01T12:00:00+02:00');

    const [listed] = await service.listEvents(
      'user-1',
      { start: new Date(), end: new Date() },
      'Europe/Warsaw',
    );
    expect(listed.start).toBe('2026-09-01T12:00:00+02:00');
  });

  it('throws CalendarEventNotFoundError when no object matches the UID', async () => {
    const objects: FakeCalendarObject[] = [
      {
        url: 'https://dav.example.com/cal/personal/other.ics',
        data: icsFor('some-other-uid', 'Other'),
      },
    ];
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve(objects),
        }),
      fakeCredentials(),
    );

    await expect(service.getEvent('user-1', 'missing-uid', 'UTC')).rejects.toThrow(
      'no event found with uid "missing-uid"',
    );
  });

  it('rejects a stored caldavUrl that is not https (defense-in-depth check at use-time)', async () => {
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve([]),
        }),
      fakeCredentials({ caldavUrl: 'http://dav.example.com' }),
    );

    await expect(
      service.listEvents('user-1', { start: new Date(), end: new Date() }, 'UTC'),
    ).rejects.toThrow('caldavUrl must use https');
  });

  it('selects the calendar matching calendarUrl when one is configured', async () => {
    const other: FakeDAVCalendar = {
      url: 'https://dav.example.com/cal/other/',
      displayName: 'Other',
    };
    const fetchCalendarObjects = mock(() => Promise.resolve([] as FakeCalendarObject[]));
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([other, fakeCalendar]),
          fetchCalendarObjects,
        }),
      fakeCredentials({ calendarUrl: fakeCalendar.url }),
    );

    await service.listEvents('user-1', { start: new Date(), end: new Date() }, 'UTC');
    expect(fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({ calendar: fakeCalendar }),
    );
  });

  // Real bug hit in production: a configured calendarName that didn't
  // match any calendar's actual displayName was silently treated the same
  // as "nothing configured at all" — a deeply misleading error when
  // credentials were, in fact, saved and correct. Matching moved from
  // displayName (human-typed, encoding-fragile) to url (server-assigned,
  // stable) to remove that whole bug class, but the mismatch case itself
  // (e.g. a calendar since deleted) still needs a distinct, actionable
  // error rather than the generic not-configured one.
  it('gives a distinct, actionable error when calendarUrl matches nothing, not the generic not-configured error', async () => {
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve([]),
        }),
      fakeCredentials({ calendarUrl: 'https://dav.example.com/cal/gone/' }),
    );

    await expect(
      service.listEvents('user-1', { start: new Date(), end: new Date() }, 'UTC'),
    ).rejects.toThrow(/gone.*personal/s);
  });

  it('uses the first calendar when no calendarUrl is configured', async () => {
    const fetchCalendarObjects = mock(() => Promise.resolve([] as FakeCalendarObject[]));
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects,
        }),
      fakeCredentials({ calendarUrl: null }),
    );

    await service.listEvents('user-1', { start: new Date(), end: new Date() }, 'UTC');
    expect(fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({ calendar: fakeCalendar }),
    );
  });
});

describe('CalendarService.previewCalendars', () => {
  it('connects with the given raw credentials and lists calendars, without touching stored credentials', async () => {
    const fetchCalendars = mock(() => Promise.resolve([fakeCalendar]));
    const createClient = mock(() =>
      Promise.resolve({ fetchCalendars, fetchCalendarObjects: () => Promise.resolve([]) }),
    );
    const { CalendarService } = await loadCalendarModule(createClient);
    const credentials = {
      getInternal: mock(() => Promise.reject(new Error('should never be called'))),
    } as unknown as CalendarCredentialsService;
    const service = new CalendarService(credentials);

    const result = await service.previewCalendars('https://dav.example.com', 'user', 'pass');

    expect(result).toEqual([{ url: fakeCalendar.url, displayName: 'Personal' }]);
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: 'https://dav.example.com',
        credentials: { username: 'user', password: 'pass' },
      }),
    );
  });

  it('rejects a non-https URL before ever connecting', async () => {
    const createClient = mock(() => Promise.reject(new Error('should never be called')));
    const { CalendarService } = await loadCalendarModule(createClient);
    const service = new CalendarService({} as CalendarCredentialsService);

    await expect(
      service.previewCalendars('http://dav.example.com', 'user', 'pass'),
    ).rejects.toThrow('caldavUrl must use https');
    expect(createClient).not.toHaveBeenCalled();
  });
});
