import type Anthropic from '@anthropic-ai/sdk';

// `requestId` is unique per `ChatService.reply()` call (i.e. per user
// message, not per tool-call iteration within it) — tools that need a
// staged action confirmed in a genuinely later turn (see
// calendar/pending-actions.ts) use it to reject a confirm attempt that
// lands in the same request as the proposal.
export interface ToolContext {
  userId: string;
  requestId: string;
  // The requesting user's own IANA timezone (`users.timezone`) — tools
  // returning date/time data should format it already localized to this,
  // so the model never has to convert timezones itself. See devlog day 12.
  timezone: string;
}

export interface ChatTool {
  definition: Anthropic.Tool;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

export const CHAT_TOOLS = Symbol('CHAT_TOOLS');
