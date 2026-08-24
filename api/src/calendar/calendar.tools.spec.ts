import { describe, expect, it, mock } from 'bun:test';
import { buildCalendarTools } from './calendar.tools';
import { CalendarNotConfiguredError } from './calendar.service';
import type { CalendarService } from './calendar.service';
import { PendingCalendarActions } from './pending-actions';

function toolByName(tools: ReturnType<typeof buildCalendarTools>, name: string) {
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
}

const ctx = (requestId = 'req-1') => ({
  userId: 'user-1',
  requestId,
  timezone: 'Europe/Warsaw',
});

describe('list_calendar_events', () => {
  it('passes the parsed date range through to the service', async () => {
    const listEvents = mock(() => Promise.resolve([{ uid: 'e1' }]));
    const calendar = { listEvents } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const result = await toolByName(tools, 'list_calendar_events').handler(
      { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
      ctx(),
    );

    expect(result).toEqual([{ uid: 'e1' }]);
    expect(listEvents).toHaveBeenCalledWith(
      'user-1',
      {
        start: new Date('2026-09-01T00:00:00Z'),
        end: new Date('2026-09-02T00:00:00Z'),
      },
      'Europe/Warsaw',
    );
  });

  it('turns a domain error into a tool_result-shaped error rather than throwing', async () => {
    const listEvents = mock(() => Promise.reject(new CalendarNotConfiguredError()));
    const calendar = { listEvents } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const result = await toolByName(tools, 'list_calendar_events').handler(
      { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
      ctx(),
    );

    expect(result).toEqual({
      error: 'no calendar connected — set it up on the profile page first',
    });
  });
});

describe('propose/confirm write flow', () => {
  it('propose_create_calendar_event stages the action without calling the service', async () => {
    const createEvent = mock(() => Promise.resolve({ uid: 'e2' }));
    const calendar = { createEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const result = (await toolByName(tools, 'propose_create_calendar_event').handler(
      { summary: 'Standup', start: '2026-09-01T10:00:00Z', end: '2026-09-01T10:15:00Z' },
      ctx(),
    )) as { confirmationId: string; summary: string };

    expect(result.confirmationId).toBeTruthy();
    expect(result.summary).toContain('Standup');
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('confirm_calendar_action executes a staged create when confirmed in a later request', async () => {
    const createEvent = mock(() => Promise.resolve({ uid: 'e2' }));
    const calendar = { createEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const proposed = (await toolByName(tools, 'propose_create_calendar_event').handler(
      { summary: 'Standup', start: '2026-09-01T10:00:00Z', end: '2026-09-01T10:15:00Z' },
      ctx('req-1'),
    )) as { confirmationId: string };

    const result = await toolByName(tools, 'confirm_calendar_action').handler(
      { confirmationId: proposed.confirmationId },
      ctx('req-2'),
    );

    expect(result).toEqual({ uid: 'e2' });
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('refuses to confirm a staged action within the same request it was proposed in', async () => {
    const createEvent = mock(() => Promise.resolve({ uid: 'e2' }));
    const calendar = { createEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const proposed = (await toolByName(tools, 'propose_create_calendar_event').handler(
      { summary: 'Standup', start: '2026-09-01T10:00:00Z', end: '2026-09-01T10:15:00Z' },
      ctx('req-1'),
    )) as { confirmationId: string };

    const result = await toolByName(tools, 'confirm_calendar_action').handler(
      { confirmationId: proposed.confirmationId },
      ctx('req-1'),
    );

    expect(result).toHaveProperty('error');
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('refuses to confirm a staged action for a different user', async () => {
    const deleteEvent = mock(() => Promise.resolve());
    const getEvent = mock(() => Promise.resolve({ summary: 'Old event' }));
    const calendar = { deleteEvent, getEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const proposed = (await toolByName(tools, 'propose_delete_calendar_event').handler(
      { uid: 'e1' },
      { userId: 'user-1', requestId: 'req-1' },
    )) as { confirmationId: string };

    const result = await toolByName(tools, 'confirm_calendar_action').handler(
      { confirmationId: proposed.confirmationId },
      { userId: 'user-2', requestId: 'req-2' },
    );

    expect(result).toHaveProperty('error');
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it('confirming an unknown confirmationId returns an error, not a throw', async () => {
    const calendar = {} as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const result = await toolByName(tools, 'confirm_calendar_action').handler(
      { confirmationId: 'does-not-exist' },
      ctx(),
    );

    expect(result).toHaveProperty('error');
  });

  it("parses an offset-less start/end as wall-clock time in the caller's timezone (issue #17 regression)", async () => {
    const createEvent = mock(() => Promise.resolve({ uid: 'e2' }));
    const calendar = { createEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const proposed = (await toolByName(tools, 'propose_create_calendar_event').handler(
      { summary: 'Randka', start: '2026-08-26T19:00:00', end: '2026-08-26T20:00:00' },
      ctx('req-1'),
    )) as { confirmationId: string };

    await toolByName(tools, 'confirm_calendar_action').handler(
      { confirmationId: proposed.confirmationId },
      ctx('req-2'),
    );

    expect(createEvent).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        start: new Date('2026-08-26T17:00:00.000Z'),
        end: new Date('2026-08-26T18:00:00.000Z'),
      }),
    );
  });

  it('propose_delete_calendar_event includes the current summary in its preview', async () => {
    const getEvent = mock(() => Promise.resolve({ summary: 'Dentist' }));
    const calendar = { getEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar, new PendingCalendarActions());

    const result = (await toolByName(tools, 'propose_delete_calendar_event').handler(
      { uid: 'e1' },
      ctx(),
    )) as { summary: string };

    expect(result.summary).toContain('Dentist');
  });
});
