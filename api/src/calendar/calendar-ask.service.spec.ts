import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ChatModel } from '../chat/chat.model';
import {
  CalendarNotConfiguredError,
  CalendarUrlMismatchError,
  type CalendarService,
} from './calendar.service';
import { CalendarAskService } from './calendar-ask.service';
import { parseQuery } from './calendar-ask.query';
import { SYSTEM_PROMPT } from './calendar-ask.prompt';
import type { ParsedEvent } from './ical-event';

const TZ = 'Europe/Warsaw';
// Monday 2026-05-04, 08:00 in Warsaw: the day the standup and lunch fixtures are on.
const MONDAY = new Date('2026-05-04T08:00:00+02:00');

const standup = {
  uid: 'standup-1',
  summary: 'Team standup',
  start: '2026-05-04T09:00:00+02:00',
  end: '2026-05-04T09:30:00+02:00',
  startWeekday: 'Monday',
  endWeekday: 'Monday',
} as ParsedEvent;

const lunch = {
  uid: 'lunch-1',
  summary: 'Lunch',
  start: '2026-05-04T13:00:00+02:00',
  end: '2026-05-04T14:00:00+02:00',
  startWeekday: 'Monday',
  endWeekday: 'Monday',
} as ParsedEvent;

function fakeModel(reply: string) {
  const generate = mock(async () => reply);
  return { model: { generate } as unknown as ChatModel, generate };
}

function fakeCalendar(events: ParsedEvent[]) {
  const listEvents = mock(async () => events);
  return { calendar: { listEvents } as unknown as CalendarService, listEvents };
}

function service(reply: string, events: ParsedEvent[] = []) {
  const { model, generate } = fakeModel(reply);
  const { calendar, listEvents } = fakeCalendar(events);
  return { ask: new CalendarAskService(model, calendar), generate, listEvents };
}

describe('parseQuery', () => {
  it('resolves the date words of a well-formed event query against now', () => {
    expect(parseQuery('{"kind":"event","pick":"first","day":"today"}', TZ, MONDAY)).toEqual({
      kind: 'event',
      pick: 'first',
      start: new Date('2026-05-03T22:00:00Z').getTime(),
      end: new Date('2026-05-04T22:00:00Z').getTime(),
    });
  });

  it('rejects a last day before the first', () => {
    expect(
      parseQuery('{"kind":"list","day":"tomorrow","until":"today"}', TZ, MONDAY),
    ).toBeUndefined();
  });

  it('rejects an unknown date word or an impossible date', () => {
    expect(parseQuery('{"kind":"count","day":"someday"}', TZ, MONDAY)).toBeUndefined();
    expect(parseQuery('{"kind":"count","day":"02-30"}', TZ, MONDAY)).toBeUndefined();
  });

  it('rejects a bare JSON array', () => {
    expect(parseQuery('[{"uid":"x"}]', TZ, MONDAY)).toBeUndefined();
  });

  it('accepts next and find without dates, lowercasing the search', () => {
    expect(parseQuery('{"kind":"next"}', TZ, MONDAY)).toEqual({ kind: 'next' });
    expect(parseQuery('{"kind":"find","search":" Sprint Review "}', TZ, MONDAY)).toEqual({
      kind: 'find',
      search: 'sprint review',
    });
  });

  it('rejects a find query without a search', () => {
    expect(parseQuery('{"kind":"find","search":"  "}', TZ, MONDAY)).toBeUndefined();
  });
});

describe('CalendarAskService', () => {
  it('returns the first event in the queried range', async () => {
    const { ask } = service('{"kind":"event","pick":"first","day":"today"}', [standup, lunch]);

    expect(await ask.ask('user-1', TZ, 'first event today?')).toEqual({
      kind: 'event',
      event: {
        uid: 'standup-1',
        title: 'Team standup',
        start: standup.start,
        end: standup.end,
        startWeekday: 'Monday',
        durationMinutes: 30,
      },
    });
  });

  it('picks the next event that starts at or after now, skipping past events', async () => {
    const past = {
      ...standup,
      uid: 'old',
      start: '2000-01-03T09:00:00+01:00',
      end: '2000-01-03T09:30:00+01:00',
    } as ParsedEvent;
    const future = {
      ...lunch,
      uid: 'future',
      start: '2099-01-03T13:00:00+01:00',
      end: '2099-01-03T14:00:00+01:00',
    } as ParsedEvent;
    const { ask } = service('{"kind":"next"}', [past, future]);

    expect(await ask.ask('user-1', TZ, 'my next meeting?')).toMatchObject({
      kind: 'event',
      event: { uid: 'future' },
    });
  });

  it('treats an event that ends exactly at the window start as not overlapping', async () => {
    const { ask } = service('{"kind":"availability","day":"today","time":"09:30"}', [standup]);

    expect(await ask.ask('user-1', TZ, 'free at 9:30?', MONDAY)).toMatchObject({
      kind: 'availability',
      busy: false,
    });
  });

  it('reports busy with the overlapping event as a conflict', async () => {
    const { ask } = service('{"kind":"availability","day":"today","time":"09:15"}', [standup]);

    expect(await ask.ask('user-1', TZ, 'free at 9:15?', MONDAY)).toMatchObject({
      kind: 'availability',
      busy: true,
      conflicts: [{ uid: 'standup-1' }],
    });
  });

  it('counts and lists events with server-written text', async () => {
    const counted = service('{"kind":"count","day":"today"}', [standup, lunch]);
    expect(await counted.ask.ask('user-1', TZ, 'how many today?')).toEqual({
      kind: 'text',
      text: 'You have 2 events in that time.',
    });

    const listed = service('{"kind":"list","day":"today"}', [standup, lunch]);
    expect(await listed.ask.ask('user-1', TZ, "what's on today?")).toEqual({
      kind: 'list',
      text: '2 events.',
      events: [
        expect.objectContaining({ uid: 'standup-1' }),
        expect.objectContaining({ uid: 'lunch-1' }),
      ],
    });
  });

  it('answers write requests with cant_do without reading the calendar', async () => {
    const { ask, listEvents } = service(
      '{"kind":"cant_do","text":"I can only read your calendar."}',
    );

    expect(await ask.ask('user-1', TZ, 'move standup to 11')).toEqual({
      kind: 'cant_do',
      text: 'I can only read your calendar.',
    });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('falls back to text on a malformed model reply without reading the calendar', async () => {
    const { ask, listEvents } = service('You have nothing tomorrow.');

    expect(await ask.ask('user-1', TZ, 'tomorrow?')).toEqual({
      kind: 'text',
      text: "I couldn't work that out. Try rephrasing the question.",
    });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('makes one model call per question with a static system prompt and only the question', async () => {
    const { ask, generate } = service('{"kind":"count","day":"today"}');

    await ask.ask('user-1', TZ, 'how many today?');
    await ask.ask('user-1', TZ, 'what about tomorrow?');

    const calls = generate.mock.calls as unknown as string[][];
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(SYSTEM_PROMPT);
    expect(calls[1][0]).toBe(SYSTEM_PROMPT);
    expect(calls[0][1]).toBe('Q: how many today?');
    expect(calls[1][1]).toBe('Q: what about tomorrow?');
  });

  it('surfaces an unreachable model as a service error', async () => {
    const model = {
      generate: mock(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    } as unknown as ChatModel;
    const ask = new CalendarAskService(model, fakeCalendar([]).calendar);

    await expect(ask.ask('user-1', TZ, 'anything?')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('searches forward from now for a next event and stops at the first match', async () => {
    const inMarch = {
      ...lunch,
      uid: 'later',
      start: '2027-03-04T13:00:00+01:00',
      end: '2027-03-04T14:00:00+01:00',
    } as ParsedEvent;
    const listEvents = mock(async (_user: string, range: { start: Date; end: Date }) =>
      [inMarch].filter(
        (event) =>
          Date.parse(event.start) < range.end.getTime() &&
          Date.parse(event.end) > range.start.getTime(),
      ),
    );
    const calendar = { listEvents } as unknown as CalendarService;
    const ask = new CalendarAskService(fakeModel('{"kind":"next"}').model, calendar);

    const before = Date.now();
    expect(await ask.ask('user-1', TZ, 'my next meeting?')).toMatchObject({
      kind: 'event',
      event: { uid: 'later' },
    });
    const ranges = listEvents.mock.calls.map(([, range]) => range);
    expect(ranges[0].start.getTime()).toBeGreaterThanOrEqual(before);
    expect(ranges.at(-1)?.end.getTime()).toBeGreaterThan(Date.parse(inMarch.start));
    expect(ranges.at(-1)?.start.getTime()).toBeLessThan(Date.parse(inMarch.start));
  });

  it('searches forward from now for a keyword and skips events that do not match', async () => {
    const dentist = {
      ...lunch,
      uid: 'dentist',
      summary: 'Dentist',
      start: '2027-06-10T10:00:00+02:00',
      end: '2027-06-10T11:00:00+02:00',
    } as ParsedEvent;
    const listEvents = mock(async (_user: string, range: { start: Date; end: Date }) =>
      [lunch, dentist].filter(
        (event) =>
          Date.parse(event.start) < range.end.getTime() &&
          Date.parse(event.end) > range.start.getTime(),
      ),
    );
    const calendar = { listEvents } as unknown as CalendarService;
    const ask = new CalendarAskService(
      fakeModel('{"kind":"find","search":"dentist appointment"}').model,
      calendar,
    );

    expect(await ask.ask('user-1', TZ, 'when is my dentist appointment?')).toMatchObject({
      kind: 'event',
      event: { uid: 'dentist' },
    });
  });

  it('answers no match once the search reaches its horizon', async () => {
    const { ask, listEvents } = service('{"kind":"next"}');

    const before = Date.now();
    expect(await ask.ask('user-1', TZ, 'my next meeting?')).toEqual({
      kind: 'text',
      text: 'No matching event.',
    });
    const lastRange = listEvents.mock.calls.at(-1)?.[1];
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    expect(lastRange?.end.getTime()).toBeGreaterThanOrEqual(before + yearMs);
    expect(lastRange?.end.getTime()).toBeLessThanOrEqual(Date.now() + yearMs);
  });
  it('maps a missing calendar configuration to a client error, not a service error', async () => {
    const model = fakeModel('{"kind":"list","day":"today"}');
    const calendar = {
      listEvents: mock(async () => {
        throw new CalendarNotConfiguredError();
      }),
    } as unknown as CalendarService;
    const ask = new CalendarAskService(model, calendar);

    await expect(ask.ask('user-1', TZ, 'what is on?')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a calendar URL mismatch to a client error', async () => {
    const model = fakeModel('{"kind":"list","day":"today"}');
    const calendar = {
      listEvents: mock(async () => {
        throw new CalendarUrlMismatchError('https://old.example/cal', ['https://new.example/cal']);
      }),
    } as unknown as CalendarService;
    const ask = new CalendarAskService(model, calendar);

    await expect(ask.ask('user-1', TZ, 'what is on?')).rejects.toBeInstanceOf(BadRequestException);
  });
});
