import { LRUCache } from 'lru-cache';
import type PQueue from 'p-queue';

// GET a URL and resolve with its JSON body. The pieces below wrap this one type, so they
// compose: cached(rateLimited(fetchJson(...))).
export type GetJson = (url: string) => Promise<unknown>;

export function fetchJson(userAgent: string, timeoutMs = 10_000): GetJson {
  return async (url) => {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  };
}

// Each request waits for a slot in the queue; the queue's options are the policy.
export function rateLimited(get: GetJson, queue: PQueue): GetJson {
  return (url) => queue.add(() => get(url));
}

// Keeps answers per URL. Concurrent requests for one URL share a fetch; failures aren't kept.
export function cached(get: GetJson, options: { max: number; ttl: number }): GetJson {
  const cache = new LRUCache<string, object>({
    ...options,
    fetchMethod: async (url) => (await get(url)) as object,
  });
  return (url) => cache.fetch(url);
}
