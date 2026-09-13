import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { ChatToolDefinition } from './chat.model';
import { OllamaChatModel } from './ollama.provider';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OllamaChatModel', () => {
  it('streams text and returns a tool call from NDJSON', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          [
            '{"message":{"role":"assistant","content":"Checking"}}\n',
            '{"message":{"role":"assistant","content":" now","tool_calls":[{"function":{"name":"list_calendar_events","arguments":{"start":"2026-09-12T00:00:00+02:00","end":"2026-09-13T00:00:00+02:00"}}}]}}\n',
            '{"done":true}\n',
          ].join(''),
        ),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const deltas: string[] = [];
    const tools: ChatToolDefinition[] = [
      {
        name: 'list_calendar_events',
        description: 'List events',
        inputSchema: { type: 'object' },
      },
    ];

    const completion = await new OllamaChatModel().complete(
      [{ role: 'user', content: 'What is on my calendar?' }],
      tools,
      (delta) => deltas.push(delta),
    );

    expect(deltas).toEqual(['Checking', ' now']);
    expect(completion).toEqual({
      message: {
        role: 'assistant',
        content: 'Checking now',
        toolCalls: [
          {
            name: 'list_calendar_events',
            arguments: {
              start: '2026-09-12T00:00:00+02:00',
              end: '2026-09-13T00:00:00+02:00',
            },
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'smollm2:1.7b',
      stream: true,
      tools: [
        {
          type: 'function',
          function: { name: 'list_calendar_events', parameters: { type: 'object' } },
        },
      ],
    });
  });

  it("translates stored tool calls to Ollama's wire format", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('{"done":true}\n')));
    globalThis.fetch = fetchMock as typeof fetch;

    await new OllamaChatModel().complete(
      [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ name: 'list_calendar_events', arguments: { start: '2026-09-12' } }],
        },
        { role: 'tool', content: '{"events":[]}', toolName: 'list_calendar_events' },
      ],
      [],
      () => {},
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'list_calendar_events',
              arguments: { start: '2026-09-12' },
            },
          },
        ],
      },
      { role: 'tool', content: '{"events":[]}', tool_name: 'list_calendar_events' },
    ]);
  });

  it('rejects an unsuccessful Ollama response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('unavailable', { status: 503 })),
    ) as typeof fetch;

    await expect(
      new OllamaChatModel().complete([], [], () => {
        throw new Error('must not stream');
      }),
    ).rejects.toThrow('Ollama chat request failed with HTTP 503');
  });

  it('rejects a stream that ends without Ollama completion metadata', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('{"message":{"content":"partial"}}\n')),
    ) as typeof fetch;

    await expect(new OllamaChatModel().complete([], [], () => {})).rejects.toThrow(
      'Ollama chat stream ended before its completion frame',
    );
  });
});
