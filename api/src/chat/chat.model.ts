export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolName?: string;
  toolCalls?: ChatToolCall[];
}

export interface ChatCompletion {
  message: ChatMessage;
  metrics?: ChatMetrics;
}

export interface ChatMetrics {
  evalCount?: number;
  evalDurationNs?: number;
  promptEvalCount?: number;
  promptEvalDurationNs?: number;
}

export interface ChatModel {
  complete(
    messages: ChatMessage[],
    tools: ChatToolDefinition[],
    onDelta: (text: string) => void,
  ): Promise<ChatCompletion>;
}

export const CHAT_MODEL = Symbol('CHAT_MODEL');
