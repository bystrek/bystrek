// Chrome 144+ and Firefox 139+ ship Temporal natively; Safari doesn't yet
// (behind a flag in Technology Preview only, not stable). The dynamic
// import means this polyfill chunk is only ever fetched by a browser (or
// test runner) that actually lacks it natively.
export async function ensureTemporal(): Promise<void> {
  if ('Temporal' in globalThis) return;
  const { Temporal } = await import('@js-temporal/polyfill');
  (globalThis as unknown as { Temporal: unknown }).Temporal = Temporal;
}
