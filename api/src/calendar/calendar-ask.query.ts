import { parseZonedIso } from './zoned-time';

// A read-only query the server runs against CalDAV. Times are epoch ms, end exclusive.
export type ReadQuery =
  | { kind: 'event'; pick: 'first' | 'last' | 'next'; start: number; end: number }
  | { kind: 'availability' | 'count' | 'list'; start: number; end: number };

export type Query = ReadQuery | { kind: 'cant_do' };

const DT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseLocalTime(value: unknown, timezone: string): number | undefined {
  if (typeof value !== 'string' || !DT_PATTERN.test(value)) return undefined;
  try {
    const time = parseZonedIso(value, timezone).getTime();
    return Number.isNaN(time) ? undefined : time;
  } catch {
    return undefined;
  }
}

// Validates the model's JSON. Anything malformed becomes undefined, which the
// caller answers with the fallback text rather than guessing a query.
export function parseQuery(content: string, timezone: string): Query | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const query = value as Record<string, unknown>;

  if (query.kind === 'cant_do') return { kind: 'cant_do' };

  const start = parseLocalTime(query.from, timezone);
  const end = parseLocalTime(query.to, timezone);
  if (start === undefined || end === undefined || end <= start) return undefined;

  if (
    query.kind === 'event' &&
    (query.pick === 'first' || query.pick === 'last' || query.pick === 'next')
  ) {
    return { kind: 'event', pick: query.pick, start, end };
  }
  if (query.kind === 'availability' || query.kind === 'count' || query.kind === 'list') {
    return { kind: query.kind, start, end };
  }
  return undefined;
}
