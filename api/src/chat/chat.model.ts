export interface ChatModel {
  // One non-streaming completion constrained to `format` (a JSON schema).
  generate(system: string, user: string, format: Record<string, unknown>): Promise<string>;
}

export const CHAT_MODEL = Symbol('CHAT_MODEL');
