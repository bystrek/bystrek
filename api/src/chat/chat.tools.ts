import type Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';

export interface ChatTool {
  definition: Anthropic.Tool;
  handler: (input: unknown) => Promise<unknown>;
}

export const CHAT_TOOLS = Symbol('CHAT_TOOLS');

// Domains register their tools here (see whats-next.md item 6 — calendar is
// the first). Empty for now: the loop in ChatService already handles
// tool_use turns, it just has nothing to dispatch to yet.
export const chatToolsProvider: Provider = {
  provide: CHAT_TOOLS,
  useValue: [] satisfies ChatTool[],
};
