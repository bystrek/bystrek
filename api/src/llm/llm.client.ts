export interface LlmJsonRequest {
  system: string;
  user: string;
}

export interface LlmClient {
  // One non-streaming completion in JSON mode. Returns the raw JSON text; callers parse
  // and validate it.
  generateJson(request: LlmJsonRequest): Promise<string>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
