import type { Provider } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from '../env';
import { LLM_CLIENT, type LlmClient } from './llm.client';
import { OllamaLlmClient } from './ollama.client';
import { OpenAiLlmClient } from './openai.client';

export function createLlmClient(): LlmClient {
  return LLM_PROVIDER === LlmProvider.OpenAi ? new OpenAiLlmClient() : new OllamaLlmClient();
}

export const llmClientProvider: Provider = {
  provide: LLM_CLIENT,
  useFactory: createLlmClient,
};
