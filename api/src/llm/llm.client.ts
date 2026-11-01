export interface LlmJsonRequest {
  system: string;
  user: string;
  // JSON schema for the reply. A hint: clients may enforce it, or send JSON mode only.
  schema: Record<string, unknown>;
}

export interface LlmClient {
  // One non-streaming completion that returns raw JSON text. It need not match
  // `schema`, so callers parse and validate it.
  generateJson(request: LlmJsonRequest): Promise<string>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
