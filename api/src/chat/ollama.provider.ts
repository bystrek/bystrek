import { Provider } from '@nestjs/common';
import { LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_MS } from '../env';
import {
  CHAT_MODEL,
  type ChatCompletion,
  type ChatMetrics,
  type ChatMessage,
  type ChatModel,
  type ChatToolCall,
  type ChatToolDefinition,
} from './chat.model';

interface OllamaStreamPart {
  done?: boolean;
  error?: string;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  message?: {
    content?: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: unknown;
      };
    }>;
  };
}

type OllamaToolCall = NonNullable<NonNullable<OllamaStreamPart['message']>['tool_calls']>[number];

function toToolCall(value: OllamaToolCall): ChatToolCall {
  const name = value.function?.name;
  const args = value.function?.arguments;
  if (!name || !args || Array.isArray(args) || typeof args !== 'object') {
    throw new Error('Ollama returned an invalid tool call');
  }
  return { name, arguments: args as Record<string, unknown> };
}

function toOllamaMessage(message: ChatMessage) {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolName ? { tool_name: message.toolName } : {}),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((toolCall) => ({
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        }
      : {}),
  };
}

export class OllamaChatModel implements ChatModel {
  async complete(
    messages: ChatMessage[],
    tools: ChatToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<ChatCompletion> {
    const response = await fetch(new URL('/api/chat', LLM_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: true,
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        messages: messages.map(toOllamaMessage),
        tools: tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama chat request failed with HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Ollama chat response had no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls: ChatToolCall[] = [];
    let metrics: ChatMetrics | undefined;
    let receivedDone = false;

    const processLine = (line: string) => {
      if (!line) return;
      const part = JSON.parse(line) as OllamaStreamPart;
      if (part.error) throw new Error(`Ollama chat request failed: ${part.error}`);
      if (part.done) {
        receivedDone = true;
        const reportedMetrics: ChatMetrics = {
          evalCount: part.eval_count,
          evalDurationNs: part.eval_duration,
          promptEvalCount: part.prompt_eval_count,
          promptEvalDurationNs: part.prompt_eval_duration,
        };
        if (Object.values(reportedMetrics).some((value) => value !== undefined)) {
          metrics = reportedMetrics;
        }
      }
      const delta = part.message?.content ?? '';
      if (delta) {
        content += delta;
        onDelta(delta);
      }
      for (const toolCall of part.message?.tool_calls ?? []) {
        toolCalls.push(toToolCall(toolCall));
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
      if (done) break;
    }
    processLine(buffer);
    if (!receivedDone) {
      throw new Error('Ollama chat stream ended before its completion frame');
    }

    return {
      message: {
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
      ...(metrics ? { metrics } : {}),
    };
  }
}

export const ollamaProvider: Provider = {
  provide: CHAT_MODEL,
  useFactory: () => new OllamaChatModel(),
};
