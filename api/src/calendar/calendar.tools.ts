import type { Provider } from '@nestjs/common';
import type { ChatTool } from '../chat/chat.tools';
import { CalendarService } from './calendar.service';
import { PendingCalendarActions, type PendingCalendarAction } from './pending-actions';

interface EventInputShape {
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  rrule?: string;
}

const CONFIRM_INSTRUCTION =
  'This only stages the change — nothing has happened yet. Show this summary to the user in your reply and wait for their next message to explicitly confirm before calling confirm_calendar_action. Never call confirm_calendar_action in the same reply as this proposal.';

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

function describeCreate(input: EventInputShape): string {
  return `Create "${input.summary}" from ${input.start} to ${input.end}${input.rrule ? ` (repeats: ${input.rrule})` : ''}.`;
}

function describeUpdate(uid: string, currentSummary: string, changes: EventInputShape): string {
  const fields = Object.entries(changes)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} → ${v}`)
    .join(', ');
  return `Update "${currentSummary}" (${uid}): ${fields || 'no fields changed'}.`;
}

function describeDelete(uid: string, currentSummary: string): string {
  return `Delete "${currentSummary}" (${uid}). This cannot be undone.`;
}

export function buildCalendarTools(
  calendar: CalendarService,
  pending: PendingCalendarActions,
): ChatTool[] {
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
      handler: async (input, ctx) => {
        const { start, end } = input as { start: string; end: string };
        return safely(() =>
          calendar.listEvents(ctx.userId, { start: new Date(start), end: new Date(end) }),
        );
      },
    },
    {
      definition: {
        name: 'propose_create_calendar_event',
        description:
          'Stage creating a calendar event for the user to confirm — does not create anything yet. Returns a confirmationId to pass to confirm_calendar_action once the user explicitly agrees. For a recurring event, pass `rrule` as a raw RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=TU".',
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
      handler: (input, ctx) => {
        const body = input as Required<Pick<EventInputShape, 'summary' | 'start' | 'end'>> &
          EventInputShape;
        const action: PendingCalendarAction = {
          kind: 'create',
          input: {
            summary: body.summary,
            start: new Date(body.start),
            end: new Date(body.end),
            description: body.description,
            location: body.location,
            rrule: body.rrule,
          },
        };
        const confirmationId = pending.stage(ctx.userId, ctx.requestId, action);
        return Promise.resolve({
          confirmationId,
          summary: describeCreate(body),
          instruction: CONFIRM_INSTRUCTION,
        });
      },
    },
    {
      definition: {
        name: 'propose_update_calendar_event',
        description:
          'Stage an update to an existing calendar event (identified by uid, from list_calendar_events) for the user to confirm — does not change anything yet. Only the fields provided are changed.',
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
      handler: async (input, ctx) => {
        const body = input as { uid: string } & EventInputShape;
        return safely(async () => {
          const current = await calendar.getEvent(ctx.userId, body.uid);
          const changes: EventInputShape = {
            summary: body.summary,
            start: body.start,
            end: body.end,
            description: body.description,
            location: body.location,
            rrule: body.rrule,
          };
          const action: PendingCalendarAction = {
            kind: 'update',
            uid: body.uid,
            input: {
              summary: body.summary,
              start: body.start ? new Date(body.start) : undefined,
              end: body.end ? new Date(body.end) : undefined,
              description: body.description,
              location: body.location,
              rrule: body.rrule,
            },
          };
          const confirmationId = pending.stage(ctx.userId, ctx.requestId, action);
          return {
            confirmationId,
            summary: describeUpdate(body.uid, current.summary, changes),
            instruction: CONFIRM_INSTRUCTION,
          };
        });
      },
    },
    {
      definition: {
        name: 'propose_delete_calendar_event',
        description:
          'Stage deleting a calendar event (identified by uid, from list_calendar_events) for the user to confirm — does not delete anything yet.',
        input_schema: {
          type: 'object',
          properties: { uid: { type: 'string' } },
          required: ['uid'],
        },
      },
      handler: async (input, ctx) => {
        const { uid } = input as { uid: string };
        return safely(async () => {
          const current = await calendar.getEvent(ctx.userId, uid);
          const action: PendingCalendarAction = { kind: 'delete', uid };
          const confirmationId = pending.stage(ctx.userId, ctx.requestId, action);
          return {
            confirmationId,
            summary: describeDelete(uid, current.summary),
            instruction: CONFIRM_INSTRUCTION,
          };
        });
      },
    },
    {
      definition: {
        name: 'confirm_calendar_action',
        description:
          "Executes a previously staged calendar change (from propose_create_calendar_event / propose_update_calendar_event / propose_delete_calendar_event) after the user has explicitly confirmed it in their own words. Only call this after the user's next message affirms the action — never in the same reply as the proposal.",
        input_schema: {
          type: 'object',
          properties: { confirmationId: { type: 'string' } },
          required: ['confirmationId'],
        },
      },
      handler: async (input, ctx) => {
        const { confirmationId } = input as { confirmationId: string };
        const action = pending.take(confirmationId, ctx.userId, ctx.requestId);
        if (!action) {
          return {
            error:
              'no confirmable pending action with that id — it may have expired, already been used, or was proposed in this same message rather than a prior one',
          };
        }
        return safely(async () => {
          if (action.kind === 'create') {
            return calendar.createEvent(ctx.userId, action.input);
          }
          if (action.kind === 'update') {
            await calendar.updateEvent(ctx.userId, action.uid, action.input);
            return { ok: true };
          }
          await calendar.deleteEvent(ctx.userId, action.uid);
          return { ok: true };
        });
      },
    },
  ];
}

export const CALENDAR_TOOLS = Symbol('CALENDAR_TOOLS');

export const calendarToolsProvider: Provider = {
  provide: CALENDAR_TOOLS,
  useFactory: (calendar: CalendarService, pending: PendingCalendarActions) =>
    buildCalendarTools(calendar, pending),
  inject: [CalendarService, PendingCalendarActions],
};
