import { describe, expect, it } from 'bun:test';
import { formatZonedIso } from './zoned-time';

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
});
