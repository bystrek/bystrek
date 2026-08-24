import { describe, expect, it } from 'bun:test';
import { assertValidTimeZone, formatZonedIso, parseZonedIso } from './zoned-time';

describe('formatZonedIso', () => {
  it('formats UTC as +00:00', () => {
    expect(formatZonedIso(new Date('2026-08-24T04:00:00Z'), 'UTC')).toBe(
      '2026-08-24T04:00:00+00:00',
    );
  });

  it('formats Europe/Warsaw in summer (CEST, UTC+2)', () => {
    expect(formatZonedIso(new Date('2026-08-24T04:00:00Z'), 'Europe/Warsaw')).toBe(
      '2026-08-24T06:00:00+02:00',
    );
  });

  it('formats Europe/Warsaw in winter (CET, UTC+1) — confirms DST is handled, not a fixed offset', () => {
    expect(formatZonedIso(new Date('2026-01-24T04:00:00Z'), 'Europe/Warsaw')).toBe(
      '2026-01-24T05:00:00+01:00',
    );
  });

  it('formats a negative-offset zone', () => {
    expect(formatZonedIso(new Date('2026-08-24T04:00:00Z'), 'America/New_York')).toBe(
      '2026-08-24T00:00:00-04:00',
    );
  });

  it('produces consistent output across repeated calls for the same timezone (formatter reuse)', () => {
    // Correctness check for the cached-formatter path — a stale/reused
    // formatter mutated between calls would show up as inconsistent output.
    const first = formatZonedIso(new Date('2026-08-24T04:00:00Z'), 'Europe/Vienna');
    const second = formatZonedIso(new Date('2026-08-24T04:00:00Z'), 'Europe/Vienna');
    expect(first).toBe(second);
    expect(first).toBe('2026-08-24T06:00:00+02:00');
  });
});

describe('parseZonedIso', () => {
  it('parses a bare (offset-less) datetime as wall-clock time in the given timezone', () => {
    // The reported issue #17 repro: "19:00 Warsaw" with no offset must not
    // be interpreted as 19:00 UTC.
    const parsed = parseZonedIso('2026-08-26T19:00:00', 'Europe/Warsaw');
    expect(parsed.toISOString()).toBe('2026-08-26T17:00:00.000Z');
  });

  it('parses a bare datetime in winter (CET, UTC+1) correctly, DST included', () => {
    const parsed = parseZonedIso('2026-01-26T19:00:00', 'Europe/Warsaw');
    expect(parsed.toISOString()).toBe('2026-01-26T18:00:00.000Z');
  });

  it('respects an explicit offset over the timezone argument', () => {
    const parsed = parseZonedIso('2026-08-26T19:00:00+00:00', 'Europe/Warsaw');
    expect(parsed.toISOString()).toBe('2026-08-26T19:00:00.000Z');
  });

  it('respects a trailing Z (UTC) over the timezone argument', () => {
    const parsed = parseZonedIso('2026-08-26T19:00:00Z', 'Europe/Warsaw');
    expect(parsed.toISOString()).toBe('2026-08-26T19:00:00.000Z');
  });

  it('round-trips with formatZonedIso', () => {
    const original = new Date('2026-08-26T17:00:00Z');
    const formatted = formatZonedIso(original, 'Europe/Warsaw');
    expect(parseZonedIso(formatted, 'Europe/Warsaw').getTime()).toBe(original.getTime());
  });

  it('throws a clear error for an unparseable string', () => {
    expect(() => parseZonedIso('not a date', 'Europe/Warsaw')).toThrow(
      'invalid date-time: "not a date"',
    );
  });

  it('throws a clear timezone error, not a misleading date-time error, for an invalid timezone', () => {
    expect(() => parseZonedIso('2026-08-26T19:00:00', 'Not/A_Real_Zone')).toThrow(
      'invalid IANA timezone: "Not/A_Real_Zone"',
    );
  });
});

describe('assertValidTimeZone', () => {
  it('does not throw for a valid IANA timezone', () => {
    expect(() => assertValidTimeZone('Europe/Warsaw')).not.toThrow();
  });

  it('throws a clear error for an invalid timezone, not a raw RangeError', () => {
    expect(() => assertValidTimeZone('Not/A_Real_Zone')).toThrow(
      'invalid IANA timezone: "Not/A_Real_Zone"',
    );
  });
});
