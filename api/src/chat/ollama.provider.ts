import { Logger, type Provider } from '@nestjs/common';
import { LLM_BASE_URL, LLM_MODEL, LLM_THINK, LLM_TIMEOUT_MS } from '../env';
import { CHAT_MODEL, type ChatModel } from './chat.model';

interface OllamaChatResponse {
  error?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  load_duration?: number;
  total_duration?: number;
}

const NANOSECONDS_PER_MS = 1_000_000;

export class OllamaChatModel implements ChatModel {
  private readonly logger = new Logger(OllamaChatModel.name);

  constructor(private readonly think: boolean | undefined = LLM_THINK) {}

  async generate(system: string, user: string, format: Record<string, unknown>): Promise<string> {
    const response = await fetch(new URL('/api/chat', LLM_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: false,
        keep_alive: '24h',
        ...(this.think === undefined ? {} : { think: this.think }),
        format,
        options: { temperature: 0, num_ctx: 2048, num_predict: 80 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama chat request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    if (body.error) throw new Error(`Ollama chat request failed: ${body.error}`);
    this.logTimings(body);
    return body.message?.content ?? '';
  }

  private logTimings(body: OllamaChatResponse): void {
    const ms = (ns: number | undefined) =>
      ns === undefined ? null : Math.round(ns / NANOSECONDS_PER_MS);
    this.logger.log(
      JSON.stringify({
        model: LLM_MODEL,
        prompt_eval_count: body.prompt_eval_count ?? null,
        prompt_eval_ms: ms(body.prompt_eval_duration),
        eval_count: body.eval_count ?? null,
        eval_ms: ms(body.eval_duration),
        load_ms: ms(body.load_duration),
        total_ms: ms(body.total_duration),
      }),
    );
  }
}

export const ollamaProvider: Provider = {
  provide: CHAT_MODEL,
  useFactory: () => new OllamaChatModel(),
};
