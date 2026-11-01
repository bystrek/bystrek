import { Logger } from '@nestjs/common';
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_MS } from '../env';
import type { LlmClient, LlmJsonRequest } from './llm.client';

interface OpenAiChatResponse {
  error?: { message?: string };
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// An OpenAI-compatible chat completions API, such as Scaleway Generative APIs.
export class OpenAiLlmClient implements LlmClient {
  private readonly logger = new Logger(OpenAiLlmClient.name);

  constructor(
    private readonly baseUrl = LLM_BASE_URL,
    private readonly apiKey = LLM_API_KEY,
  ) {}

  // JSON mode, not a json_schema response format: Scaleway's schema-constrained decoding
  // skewed which optional fields models picked (e.g. never `day`).
  async generateJson({ system, user }: LlmJsonRequest): Promise<string> {
    const started = performance.now();
    // Appended, not resolved: the base URL carries a path (e.g. /<project-id>/v1).
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: false,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as OpenAiChatResponse;
    if (body.error) {
      throw new Error(`OpenAI-compatible request failed: ${body.error.message ?? 'unknown'}`);
    }
    this.logger.log(
      JSON.stringify({
        model: LLM_MODEL,
        prompt_tokens: body.usage?.prompt_tokens ?? null,
        completion_tokens: body.usage?.completion_tokens ?? null,
        total_ms: Math.round(performance.now() - started),
      }),
    );
    return body.choices?.[0]?.message?.content ?? '';
  }
}
