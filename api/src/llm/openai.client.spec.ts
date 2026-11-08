import { afterEach, describe, expect, it, mock } from 'bun:test';
import { LlmError } from './llm.client';
import { OpenAiLlmClient } from './openai.client';

const originalFetch = globalThis.fetch;
const BASE_URL = 'https://api.example.test/project-1/v1/';

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

function client() {
  return new OpenAiLlmClient(BASE_URL, 'secret-key');
}

describe('OpenAiLlmClient.generateJson', () => {
  it('posts one non-streaming chat completion in JSON mode', async () => {
    const fetchMock = stubFetch({ choices: [{ message: { content: '{"kind":"count"}' } }] });

    const content = await client().generateJson({ system: 'SYS', user: 'USER', maxTokens: 80 });

    expect(content).toBe('{"kind":"count"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/project-1/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-key' });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      stream: false,
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
    });
    expect(body).not.toHaveProperty('tools');
  });

  it('rejects an unsuccessful response', async () => {
    stubFetch({}, { status: 403 });

    await expect(client().generateJson({ system: 's', user: 'u', maxTokens: 80 })).rejects.toThrow(
      'OpenAI-compatible request failed with HTTP 403',
    );
  });

  it('rejects a response that carries an error', async () => {
    stubFetch({ error: { message: 'model not found' } });

    await expect(client().generateJson({ system: 's', user: 'u', maxTokens: 80 })).rejects.toThrow(
      'OpenAI-compatible request failed: model not found',
    );
  });
});

describe('OpenAiLlmClient failures', () => {
  it('wraps a network failure in an LlmError', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError('fetch failed')),
    ) as unknown as typeof fetch;

    await expect(
      client().generateJson({ system: 's', user: 'u', maxTokens: 80 }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('sends the requested reply cap', async () => {
    const fetchMock = stubFetch({ choices: [{ message: { content: '{}' } }] });

    await client().generateJson({ system: 's', user: 'u', maxTokens: 600 });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ max_tokens: 600 });
  });
});
