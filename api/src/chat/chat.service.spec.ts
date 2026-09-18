import { describe, expect, it } from 'bun:test';
import type { ChatMessage } from './chat.model';
import { collapseTurnText, parseStoredMessage, toHistoryTurns } from './chat.service';

describe('parseStoredMessage', () => {
  it('preserves the current provider-neutral message format', () => {
    expect(
      parseStoredMessage(
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ name: 'list_calendar_events', arguments: { start: '2026-09-18' } }],
        },
        'assistant',
      ),
    ).toEqual({
      role: 'assistant',
      content: '',
      toolCalls: [{ name: 'list_calendar_events', arguments: { start: '2026-09-18' } }],
    });
  });

  it('converts legacy string content using the database role', () => {
    expect(parseStoredMessage('hello', 'user')).toEqual({ role: 'user', content: 'hello' });
  });

  it('converts legacy Anthropic text blocks and ignores tool blocks', () => {
    expect(
      parseStoredMessage(
        [
          { type: 'text', text: 'Checking' },
          { type: 'tool_use', id: 'tool-1', name: 'test', input: {} },
          { type: 'text', text: ' now' },
        ],
        'assistant',
      ),
    ).toEqual({ role: 'assistant', content: 'Checking now' });
  });

  it('drops legacy tool-only turns', () => {
    expect(
      parseStoredMessage([{ type: 'tool_result', tool_use_id: 'tool-1', content: '{}' }], 'user'),
    ).toBeNull();
  });

  it('rejects unknown legacy content blocks', () => {
    expect(() =>
      parseStoredMessage([{ type: 'image', source: 'unsupported' }], 'assistant'),
    ).toThrow('Unsupported legacy chat content block');
  });

  it('rejects unknown stored values', () => {
    expect(() => parseStoredMessage({ role: 'assistant' }, 'assistant')).toThrow(
      'Unsupported stored chat message format',
    );
  });
});

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
