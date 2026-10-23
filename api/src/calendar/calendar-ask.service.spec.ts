import { describe, expect, it, mock } from 'bun:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ChatModel } from '../chat/chat.model';
import type { CalendarService } from './calendar.service';
import { CalendarAskService, parseQuery } from './calendar-ask.service';
import type { ParsedEvent } from './ical-event';

const TZ = 'Europe/Warsaw';

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
  it('accepts a well-formed event query', () => {
    expect(
      parseQuery(
        '{"kind":"event","pick":"first","from":"2026-05-04T00:00","to":"2026-05-04T23:59"}',
        TZ,
      ),
    ).toEqual({
      kind: 'event',
      pick: 'first',
      start: new Date('2026-05-03T22:00:00Z').getTime(),
      end: new Date('2026-05-04T21:59:00Z').getTime(),
    });
  });

  it('rejects a range that ends before it starts', () => {
    expect(
      parseQuery('{"kind":"list","from":"2026-05-05T00:00","to":"2026-05-04T00:00"}', TZ),
    ).toBeUndefined();
  });

  it('rejects an impossible date', () => {
    expect(
      parseQuery('{"kind":"count","from":"2026-02-30T00:00","to":"2026-03-01T00:00"}', TZ),
    ).toBeUndefined();
  });

  it('rejects a bare JSON array', () => {
    expect(parseQuery('[{"uid":"x"}]', TZ)).toBeUndefined();
  });
});

describe('CalendarAskService', () => {
  it('returns the first event in the queried range', async () => {
    const { ask } = service(
      '{"kind":"event","pick":"first","from":"2026-05-04T00:00","to":"2026-05-04T23:59"}',
      [standup, lunch],
    );

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
    const { ask } = service(
      '{"kind":"event","pick":"next","from":"2000-01-01T00:00","to":"2099-12-31T23:59"}',
      [past, future],
    );

    expect(await ask.ask('user-1', TZ, 'my next meeting?')).toMatchObject({
      kind: 'event',
      event: { uid: 'future' },
    });
  });

  it('treats an event that ends exactly at the window start as not overlapping', async () => {
    const { ask } = service(
      '{"kind":"availability","from":"2026-05-04T09:30","to":"2026-05-04T10:00"}',
      [standup],
    );

    expect(await ask.ask('user-1', TZ, 'free at 9:30?')).toMatchObject({
      kind: 'availability',
      busy: false,
    });
  });

  it('reports busy with the overlapping event as a conflict', async () => {
    const { ask } = service(
      '{"kind":"availability","from":"2026-05-04T09:15","to":"2026-05-04T10:00"}',
      [standup],
    );

    expect(await ask.ask('user-1', TZ, 'free at 9:15?')).toMatchObject({
      kind: 'availability',
      busy: true,
      conflicts: [{ uid: 'standup-1' }],
    });
  });

  it('counts and lists events with server-written text', async () => {
    const counted = service('{"kind":"count","from":"2026-05-04T00:00","to":"2026-05-04T23:59"}', [
      standup,
      lunch,
    ]);
    expect(await counted.ask.ask('user-1', TZ, 'how many today?')).toEqual({
      kind: 'text',
      text: 'You have 2 events in that time.',
    });

    const listed = service('{"kind":"list","from":"2026-05-04T00:00","to":"2026-05-04T23:59"}', [
      standup,
      lunch,
    ]);
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

  it('sends the same static system prompt on every call, with the dynamic part last', async () => {
    const { ask, generate } = service(
      '{"kind":"count","from":"2026-05-04T00:00","to":"2026-05-04T23:59"}',
    );

    await ask.ask('user-1', TZ, 'how many today?');
    await ask.ask('user-1', TZ, 'what about tomorrow?');

    const [firstSystem, firstUser] = generate.mock.calls[0] as unknown as string[];
    const [secondSystem, secondUser] = generate.mock.calls[1] as unknown as string[];
    expect(firstSystem).toBe(secondSystem);
    expect(firstUser).toContain('Q: how many today?');
    expect(secondUser).toContain('Q: what about tomorrow?');
    expect(firstUser).toMatch(/^Now: \w{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}\nDates: \w{3} /);
    expect(firstUser).toMatch(
      /\nWeekdays: (\w{3}=\d{4}-\d{2}-\d{2}, ){6}\w{3}=\d{4}-\d{2}-\d{2}\n/,
    );
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
});
