import { describe, expect, it } from 'bun:test';
import type Anthropic from '@anthropic-ai/sdk';
import { collapseTurnText, toHistoryTurns } from './chat.service';

describe('collapseTurnText', () => {
  it('returns plain string content as-is', () => {
    expect(collapseTurnText('what is my week look like?')).toBe('what is my week look like?');
  });

  it('concatenates text blocks in an array', () => {
    const content: Anthropic.MessageParam['content'] = [
      { type: 'text', text: 'Hello ', citations: [] },
      { type: 'text', text: 'there', citations: [] },
    ];
    expect(collapseTurnText(content)).toBe('Hello there');
  });

  it('returns null for a turn with no text blocks', () => {
    const content: Anthropic.MessageParam['content'] = [
      { type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} },
    ];
    expect(collapseTurnText(content)).toBeNull();
  });

  it('drops tool_use/tool_result blocks but keeps any text block mixed in', () => {
    const content: Anthropic.MessageParam['content'] = [
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' },
      { type: 'text', text: 'done', citations: [] },
    ];
    expect(collapseTurnText(content)).toBe('done');
  });
});

describe('toHistoryTurns', () => {
  it('returns an empty list for empty history', () => {
    expect(toHistoryTurns([])).toEqual([]);
  });

  it('drops turns with no resulting text and keeps the rest in order', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'done', citations: [] }] },
    ];

    expect(toHistoryTurns(messages)).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'done' },
    ]);
  });
});
