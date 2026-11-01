import type { Provider } from '@nestjs/common';
import { LLM_CLIENT } from './llm.client';
import { OpenAiLlmClient } from './openai.client';

export const llmClientProvider: Provider = {
  provide: LLM_CLIENT,
  useFactory: () => new OpenAiLlmClient(),
};
