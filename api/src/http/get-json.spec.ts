import { afterEach, describe, expect, it, mock } from 'bun:test';
import PQueue from 'p-queue';
import { cached, fetchJson, rateLimited, type GetJson } from './get-json';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchJson', () => {
  it('sends the User-Agent and resolves with the JSON body', async () => {
    const fetchMock = mock(() => Promise.resolve(Response.json([1, 2])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchJson('bystrek-test')('https://geo.example.test/a')).toEqual([1, 2]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://geo.example.test/a');
    expect(init.headers).toMatchObject({ 'User-Agent': 'bystrek-test' });
  });

  it('rejects a non-2xx response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('busy', { status: 429 })),
    ) as unknown as typeof fetch;

    await expect(fetchJson('test')('https://geo.example.test/a')).rejects.toThrow('HTTP 429');
  });
});

describe('rateLimited', () => {
  it('starts requests at least one interval apart', async () => {
    const starts: number[] = [];
    const get = rateLimited(
      () => {
        starts.push(performance.now());
        return Promise.resolve([]);
      },
      new PQueue({ concurrency: 1, intervalCap: 1, interval: 50 }),
    );

    await get('a');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await Promise.all([get('b'), get('c')]);

    // 1 ms of slack for timer granularity.
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(49);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(49);
  });
});

describe('cached', () => {
  const options = { max: 10, ttl: 60_000 };

  it('shares one request between concurrent and repeated calls for a URL', async () => {
    const inner = mock<GetJson>(() => Promise.resolve([1]));
    const get = cached(inner, options);

    const [a, b] = await Promise.all([get('u'), get('u')]);
    const c = await get('u');

    expect([a, b, c]).toEqual([[1], [1], [1]]);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure', async () => {
    const inner = mock<GetJson>()
      .mockImplementationOnce(() => Promise.reject(new Error('down')))
      .mockImplementationOnce(() => Promise.resolve([1]));
    const get = cached(inner, options);

    await expect(get('u')).rejects.toThrow('down');
    expect(await get('u')).toEqual([1]);
  });

  it('answers a hit without waiting for the rate limit when composed outside it', async () => {
    const inner = mock<GetJson>(() => Promise.resolve([1]));
    const get = cached(
      rateLimited(inner, new PQueue({ concurrency: 1, intervalCap: 1, interval: 60_000 })),
      options,
    );

    await get('u');
    const started = performance.now();
    await get('u');

    expect(performance.now() - started).toBeLessThan(20);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
