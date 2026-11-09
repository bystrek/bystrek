import { fakePocketId } from './fake-pocket-id';

// better-auth fetches Pocket ID's discovery document on the first request to
// every auth instance, so every integration test talks to the fake instead.
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    return fakePocketId.handles(url) ? fakePocketId.fetch(url, init) : realFetch(input, init);
  },
  { preconnect: realFetch.preconnect },
);
