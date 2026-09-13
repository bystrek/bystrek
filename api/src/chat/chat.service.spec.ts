import { describe, expect, it } from 'bun:test';
import type { ChatMessage } from './chat.model';
import { collapseTurnText, toHistoryTurns } from './chat.service';

describe('collapseTurnText', () => {
  it('returns plain string content as-is', () => {
    expect(collapseTurnText({ role: 'user', content: 'what is my week look like?' })).toBe(
      'what is my week look like?',
    );
  });

  it('returns null for empty string content, same as an array with no text blocks', () => {
    expect(collapseTurnText({ role: 'assistant', content: '' })).toBeNull();
  });

  it('concatenates text blocks in an array', () => {
    expect(collapseTurnText({ role: 'assistant', content: 'Hello there' })).toBe('Hello there');
  });

  it('returns null for a turn with no text blocks', () => {
    expect(
      collapseTurnText({
        role: 'assistant',
        content: '',
        toolCalls: [{ name: 'test_tool', arguments: {} }],
      }),
    ).toBeNull();
  });

  it('drops tool_use/tool_result blocks but keeps any text block mixed in', () => {
    expect(collapseTurnText({ role: 'assistant', content: 'done' })).toBe('done');
  });
});

describe('toHistoryTurns', () => {
  it('returns an empty list for empty history', () => {
    expect(toHistoryTurns([])).toEqual([]);
  });

  it('drops turns with no resulting text and keeps the rest in order', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ name: 'test_tool', arguments: {} }],
      },
      {
        role: 'tool',
        content: '{}',
      },
      { role: 'assistant', content: 'done' },
    ];

    expect(toHistoryTurns(messages)).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'done' },
    ]);
  });
});
