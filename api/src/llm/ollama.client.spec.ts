import { afterEach, describe, expect, it, mock } from 'bun:test';
import { OllamaLlmClient } from './ollama.client';

const originalFetch = globalThis.fetch;
const SCHEMA = { type: 'object', required: ['kind'] };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(body: unknown, init?: ResponseInit) {
  const fetchMock = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, ...init })),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('OllamaLlmClient.generateJson', () => {
  it('sends one non-streaming, tool-free request with the JSON format and fixed options', async () => {
    const fetchMock = stubFetch({ message: { content: '{"kind":"count"}' } });

    const content = await new OllamaLlmClient(false).generateJson({
      system: 'SYS',
      user: 'USER',
      schema: SCHEMA,
    });

    expect(content).toBe('{"kind":"count"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      stream: false,
      keep_alive: '24h',
      think: false,
      format: SCHEMA,
      options: { temperature: 0, num_ctx: 2048, num_predict: 80 },
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
    });
    expect(body).not.toHaveProperty('tools');
  });

  it('rejects an unsuccessful Ollama response', async () => {
    stubFetch({}, { status: 503 });

    await expect(
      new OllamaLlmClient().generateJson({ system: 's', user: 'u', schema: SCHEMA }),
    ).rejects.toThrow('Ollama chat request failed with HTTP 503');
  });

  it('rejects a response that carries an Ollama error', async () => {
    stubFetch({ error: 'model not found' });

    await expect(
      new OllamaLlmClient().generateJson({ system: 's', user: 'u', schema: SCHEMA }),
    ).rejects.toThrow('Ollama chat request failed: model not found');
  });
});
