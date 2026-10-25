import { resolveWhen } from './calendar-ask.dates';
import { assertValidTimeZone } from './zoned-time';

// A read-only query the server runs against CalDAV. Times are epoch ms, end exclusive.
export type ReadQuery =
  | { kind: 'event'; pick: 'first' | 'last'; start: number; end: number }
  | { kind: 'availability' | 'count' | 'list'; start: number; end: number };

// The next event at or after now, optionally only events whose title matches `search`
// (lowercased). The server picks the window by searching forward, so the model sends no dates.
export type SearchQuery = { kind: 'next' } | { kind: 'find'; search: string };

export type ParsedQuery = ReadQuery | SearchQuery | { kind: 'cant_do' };

// Caps model-chosen ranges so CalDAV never expands an unbounded recurrence span.
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_SEARCH_LENGTH = 100;

function parseSearch(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const search = value.trim().toLowerCase().slice(0, MAX_SEARCH_LENGTH);
  return search || undefined;
}

// Validates the model's JSON and resolves its date words against `now`. Anything malformed
// becomes undefined, which the caller answers with the fallback text rather than guessing.
export function parseQuery(content: string, timezone: string, now: Date): ParsedQuery | undefined {
  // A bad timezone comes from our own user record, not the model, so it throws.
  assertValidTimeZone(timezone);
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const query = value as Record<string, unknown>;

  if (query.kind === 'cant_do') return { kind: 'cant_do' };
  if (query.kind === 'next') return { kind: 'next' };
  if (query.kind === 'find') {
    const search = parseSearch(query.search);
    return search ? { kind: 'find', search } : undefined;
  }

  const window = resolveWhen(query, now, timezone);
  if (!window || window.end - window.start > MAX_RANGE_MS) return undefined;
  const { start, end } = window;

  if (query.kind === 'event' && (query.pick === 'first' || query.pick === 'last')) {
    return { kind: 'event', pick: query.pick, start, end };
  }
  if (query.kind === 'availability' || query.kind === 'count' || query.kind === 'list') {
    return { kind: query.kind, start, end };
  }
  return undefined;
}
