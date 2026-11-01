export interface LlmJsonRequest {
  system: string;
  user: string;
  // JSON schema the reply must match.
  schema: Record<string, unknown>;
}

export interface LlmClient {
  // One non-streaming completion constrained to `schema`. Returns the raw JSON text;
  // callers parse and validate it.
  generateJson(request: LlmJsonRequest): Promise<string>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
