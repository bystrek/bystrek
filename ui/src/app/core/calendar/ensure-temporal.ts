// Safari has no native Temporal yet — dynamic import so the polyfill
// chunk is only fetched where it's actually needed.
export async function ensureTemporal(): Promise<void> {
  if ('Temporal' in globalThis) return;
  const { Temporal } = await import('@js-temporal/polyfill');
  (globalThis as unknown as { Temporal: unknown }).Temporal = Temporal;
}
