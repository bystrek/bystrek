import type { Provider } from '@nestjs/common';
import type { ChatTool } from '../chat/chat.tools';
import { CalendarService } from './calendar.service';

interface EventInputShape {
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  rrule?: string;
}

// Tool handlers never throw — a failure (no calendar connected, event not
// found, upstream CalDAV error) becomes a `{ error }` tool_result so Claude
// can explain it or ask the user to fix it, rather than the whole chat
// request failing.
async function safely<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'calendar request failed' };
  }
}

export function buildCalendarTools(calendar: CalendarService): ChatTool[] {
  return [
    {
      definition: {
        name: 'list_calendar_events',
        description:
          "List the user's calendar events in a date/time range. Recurring events are already expanded into individual occurrences by the calendar server.",
        input_schema: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'ISO 8601 start of the range' },
            end: { type: 'string', description: 'ISO 8601 end of the range' },
          },
          required: ['start', 'end'],
        },
      },
      handler: async (input, userId) => {
        const { start, end } = input as { start: string; end: string };
        return safely(() =>
          calendar.listEvents(userId, { start: new Date(start), end: new Date(end) }),
        );
      },
    },
    {
      definition: {
        name: 'create_calendar_event',
        description:
          'Create a calendar event. For a recurring event, pass `rrule` as a raw RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=TU".',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            start: { type: 'string', description: 'ISO 8601 start time' },
            end: { type: 'string', description: 'ISO 8601 end time' },
            description: { type: 'string' },
            location: { type: 'string' },
            rrule: { type: 'string', description: 'RFC 5545 RRULE value, omit if not recurring' },
          },
          required: ['summary', 'start', 'end'],
        },
      },
      handler: async (input, userId) => {
        const body = input as Required<Pick<EventInputShape, 'summary' | 'start' | 'end'>> &
          EventInputShape;
        return safely(() =>
          calendar.createEvent(userId, {
            summary: body.summary,
            start: new Date(body.start),
            end: new Date(body.end),
            description: body.description,
            location: body.location,
            rrule: body.rrule,
          }),
        );
      },
    },
    {
      definition: {
        name: 'update_calendar_event',
        description:
          'Update fields on an existing calendar event, identified by uid (from list_calendar_events). Only the fields provided are changed.',
        input_schema: {
          type: 'object',
          properties: {
            uid: { type: 'string' },
            summary: { type: 'string' },
            start: { type: 'string', description: 'ISO 8601 start time' },
            end: { type: 'string', description: 'ISO 8601 end time' },
            description: { type: 'string' },
            location: { type: 'string' },
            rrule: { type: 'string', description: 'RFC 5545 RRULE value; pass "" to clear' },
          },
          required: ['uid'],
        },
      },
      handler: async (input, userId) => {
        const body = input as { uid: string } & EventInputShape;
        return safely(async () => {
          await calendar.updateEvent(userId, body.uid, {
            summary: body.summary,
            start: body.start ? new Date(body.start) : undefined,
            end: body.end ? new Date(body.end) : undefined,
            description: body.description,
            location: body.location,
            rrule: body.rrule,
          });
          return { ok: true };
        });
      },
    },
    {
      definition: {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event, identified by uid (from list_calendar_events).',
        input_schema: {
          type: 'object',
          properties: { uid: { type: 'string' } },
          required: ['uid'],
        },
      },
      handler: async (input, userId) => {
        const { uid } = input as { uid: string };
        return safely(async () => {
          await calendar.deleteEvent(userId, uid);
          return { ok: true };
        });
      },
    },
  ];
}

export const CALENDAR_TOOLS = Symbol('CALENDAR_TOOLS');

export const calendarToolsProvider: Provider = {
  provide: CALENDAR_TOOLS,
  useFactory: (calendar: CalendarService) => buildCalendarTools(calendar),
  inject: [CalendarService],
};
