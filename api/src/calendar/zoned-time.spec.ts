import { describe, expect, it } from 'bun:test';
import { assertValidTimeZone, formatZonedIso } from './zoned-time';

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
