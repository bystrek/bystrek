import Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';
import { ANTHROPIC_API_KEY } from '../env';

export const ANTHROPIC = Symbol('ANTHROPIC');

export const anthropicProvider: Provider = {
  provide: ANTHROPIC,
  useFactory: () => new Anthropic({ apiKey: ANTHROPIC_API_KEY }),
};
