export interface LlmJsonRequest {
  system: string;
  user: string;
  // Caps the reply. A reply cut off by the cap is invalid JSON, so size it to the largest
  // valid answer.
  maxTokens: number;
}

export interface LlmClient {
  // One non-streaming completion in JSON mode. Returns the raw JSON text; callers parse
  // and validate it. Every failure to get a reply is an LlmError.
  generateJson(request: LlmJsonRequest): Promise<string>;
}

// The model couldn't answer (network, timeout, HTTP or API error).
export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
  }
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
