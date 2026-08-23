import type Anthropic from '@anthropic-ai/sdk';

export interface ChatTool {
  definition: Anthropic.Tool;
  handler: (input: unknown, userId: string) => Promise<unknown>;
}

export const CHAT_TOOLS = Symbol('CHAT_TOOLS');
