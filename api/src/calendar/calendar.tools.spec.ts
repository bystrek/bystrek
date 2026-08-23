import { describe, expect, it, mock } from 'bun:test';
import { buildCalendarTools } from './calendar.tools';
import { CalendarNotConfiguredError } from './calendar.service';
import type { CalendarService } from './calendar.service';

function toolByName(tools: ReturnType<typeof buildCalendarTools>, name: string) {
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
}

describe('calendar chat tools', () => {
  it('list_calendar_events passes the parsed date range through to the service', async () => {
    const listEvents = mock(() => Promise.resolve([{ uid: 'e1' }]));
    const calendar = { listEvents } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar);

    const result = await toolByName(tools, 'list_calendar_events').handler(
      { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
      'user-1',
    );

    expect(result).toEqual([{ uid: 'e1' }]);
    expect(listEvents).toHaveBeenCalledWith('user-1', {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-09-02T00:00:00Z'),
    });
  });

  it('create_calendar_event forwards optional fields and returns the created uid', async () => {
    const createEvent = mock(() => Promise.resolve({ uid: 'e2' }));
    const calendar = { createEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar);

    const result = await toolByName(tools, 'create_calendar_event').handler(
      {
        summary: 'Standup',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T10:15:00Z',
        rrule: 'FREQ=DAILY',
      },
      'user-1',
    );

    expect(result).toEqual({ uid: 'e2' });
    expect(createEvent).toHaveBeenCalledWith('user-1', {
      summary: 'Standup',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T10:15:00Z'),
      description: undefined,
      location: undefined,
      rrule: 'FREQ=DAILY',
    });
  });

  it('turns a domain error into a tool_result-shaped error rather than throwing', async () => {
    const listEvents = mock(() => Promise.reject(new CalendarNotConfiguredError()));
    const calendar = { listEvents } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar);

    const result = await toolByName(tools, 'list_calendar_events').handler(
      { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
      'user-1',
    );

    expect(result).toEqual({
      error: 'no calendar connected — set it up on the profile page first',
    });
  });

  it('delete_calendar_event returns ok on success', async () => {
    const deleteEvent = mock(() => Promise.resolve());
    const calendar = { deleteEvent } as unknown as CalendarService;
    const tools = buildCalendarTools(calendar);

    const result = await toolByName(tools, 'delete_calendar_event').handler(
      { uid: 'e1' },
      'user-1',
    );

    expect(result).toEqual({ ok: true });
    expect(deleteEvent).toHaveBeenCalledWith('user-1', 'e1');
  });
});
