import { afterEach, describe, expect, it, mock } from 'bun:test';
import { OpenAiLlmClient } from './openai.client';

const originalFetch = globalThis.fetch;
const SCHEMA = { type: 'object', required: ['kind'] };
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

    const content = await client().generateJson({ system: 'SYS', user: 'USER', schema: SCHEMA });

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
    expect(JSON.stringify(body)).not.toContain('json_schema');
  });

  it('rejects an unsuccessful response', async () => {
    stubFetch({}, { status: 403 });

    await expect(client().generateJson({ system: 's', user: 'u', schema: SCHEMA })).rejects.toThrow(
      'OpenAI-compatible request failed with HTTP 403',
    );
  });

  it('rejects a response that carries an error', async () => {
    stubFetch({ error: { message: 'model not found' } });

    await expect(client().generateJson({ system: 's', user: 'u', schema: SCHEMA })).rejects.toThrow(
      'OpenAI-compatible request failed: model not found',
    );
  });
});
