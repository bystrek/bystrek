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
  url: 'https://dav.example.com/cal/',
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
    calendarName: null,
    ...overrides,
  };
  return { getInternal: () => Promise.resolve(creds) } as unknown as CalendarCredentialsService;
}

// tsdav is mocked at the module level so CalendarService's actual CalDAV
// boundary logic (calendar selection, UID-based lookup, not just the ICS
// helpers) gets exercised — see devlog day 12: the UID-by-filename bug this
// catches would have passed CI with only mocked-tool-handler tests.
async function loadCalendarService(
  createClient: () => Promise<{
    fetchCalendars: () => Promise<FakeDAVCalendar[]>;
    fetchCalendarObjects: (params: unknown) => Promise<FakeCalendarObject[]>;
  }>,
  credentials: CalendarCredentialsService,
) {
  await mock.module('tsdav', () => ({ createDAVClient: createClient }));
  // Dynamic `import()` resolves to `any` under this project's
  // sourceType:'commonjs' ESLint config vs. tsconfig's module:'nodenext' —
  // a tooling mismatch, not an actual unsafe value (the explicit type
  // annotation above doesn't clear it, since the rule checks the source
  // expression's inferred type, not the assignment target).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const calendarServiceModule: typeof import('./calendar.service') =
    await import('./calendar.service');
  return new calendarServiceModule.CalendarService(credentials);
}

describe('CalendarService', () => {
  it('finds an event by its actual iCalendar UID, not by resource filename', async () => {
    // Deliberately named so the filename does NOT contain the UID —
    // reproduces the bug where matching by `${uid}.ics` silently failed
    // for events not created by this service.
    const objects: FakeCalendarObject[] = [
      {
        url: 'https://dav.example.com/cal/imported-event-1.ics',
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

    const event = await service.getEvent('user-1', 'real-uid-1');
    expect(event.summary).toBe('Dentist');
  });

  it('throws CalendarEventNotFoundError when no object matches the UID', async () => {
    const objects: FakeCalendarObject[] = [
      { url: 'https://dav.example.com/cal/other.ics', data: icsFor('some-other-uid', 'Other') },
    ];
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve(objects),
        }),
      fakeCredentials(),
    );

    await expect(service.getEvent('user-1', 'missing-uid')).rejects.toThrow(
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
      service.listEvents('user-1', { start: new Date(), end: new Date() }),
    ).rejects.toThrow('caldavUrl must use https');
  });

  it('selects the calendar matching calendarName when one is configured', async () => {
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
      fakeCredentials({ calendarName: 'Personal' }),
    );

    await service.listEvents('user-1', { start: new Date(), end: new Date() });
    expect(fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({ calendar: fakeCalendar }),
    );
  });

  // Real bug hit in production: a configured calendarName that doesn't
  // match any calendar's actual displayName was silently treated the same
  // as "nothing configured at all" — a deeply misleading error when
  // credentials were, in fact, saved and correct.
  it('gives a distinct, actionable error when calendarName matches nothing, not the generic not-configured error', async () => {
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects: () => Promise.resolve([]),
        }),
      fakeCredentials({ calendarName: 'kCalendar' }),
    );

    await expect(
      service.listEvents('user-1', { start: new Date(), end: new Date() }),
    ).rejects.toThrow(/kCalendar.*Personal/s);
  });

  it('matches calendarName even when Unicode-normalized differently (NFD vs NFC)', async () => {
    // "é" as a single precomposed codepoint (NFC) vs. "e" + a combining
    // acute accent (NFD) — renders identically, compares unequal with a
    // naive `===` (unlike e.g. Polish "ł", which has no NFD decomposition
    // at all — this needs a character that genuinely does).
    const nfc = 'Café Calendar';
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd); // sanity check they really are byte-different

    const owner: FakeDAVCalendar = { url: 'https://dav.example.com/cal/owner/', displayName: nfd };
    const fetchCalendarObjects = mock(() => Promise.resolve([] as FakeCalendarObject[]));
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([owner]),
          fetchCalendarObjects,
        }),
      fakeCredentials({ calendarName: nfc }),
    );

    await service.listEvents('user-1', { start: new Date(), end: new Date() });
    expect(fetchCalendarObjects).toHaveBeenCalledWith(expect.objectContaining({ calendar: owner }));
  });

  it('uses the first calendar when no calendarName is configured', async () => {
    const fetchCalendarObjects = mock(() => Promise.resolve([] as FakeCalendarObject[]));
    const service = await loadCalendarService(
      () =>
        Promise.resolve({
          fetchCalendars: () => Promise.resolve([fakeCalendar]),
          fetchCalendarObjects,
        }),
      fakeCredentials({ calendarName: null }),
    );

    await service.listEvents('user-1', { start: new Date(), end: new Date() });
    expect(fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({ calendar: fakeCalendar }),
    );
  });
});
