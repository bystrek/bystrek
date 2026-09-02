import { describe, expect, it } from 'bun:test';
import {
  assertValidTimeZone,
  formatZonedIso,
  parseZonedIso,
  weekBoundsAround,
  weekdayName,
} from './zoned-time';

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

describe('weekdayName', () => {
  it('returns the English weekday for a date in the given timezone', () => {
    // 2026-09-06 is a Sunday. The instant chosen falls on the same day in
    // Europe/Warsaw despite being late UTC.
    expect(weekdayName(new Date('2026-09-06T20:00:00Z'), 'Europe/Warsaw')).toBe('Sunday');
    expect(weekdayName(new Date('2026-09-07T00:00:00Z'), 'Europe/Warsaw')).toBe('Monday');
  });

  it('respects timezone when a UTC instant crosses midnight', () => {
    // 2026-09-06T23:30Z = 2026-09-06 (UTC, Saturday) but 2026-09-07T01:30
    // in Europe/Warsaw (Sunday, next day) — regression guard against
    // deriving the weekday from raw UTC instead of the zoned wall clock.
    const instant = new Date('2026-09-06T23:30:00Z');
    expect(weekdayName(instant, 'UTC')).toBe('Sunday');
    expect(weekdayName(instant, 'Europe/Warsaw')).toBe('Monday');
  });
});

describe('weekBoundsAround', () => {
  it('returns the Mon-Sun bounds of the ISO week containing the date', () => {
    // 2026-09-02 is a Wednesday, so this week runs 08-31 (Mon) — 09-06 (Sun).
    const bounds = weekBoundsAround(new Date('2026-09-02T10:00:00+02:00'), 'Europe/Warsaw');
    expect(bounds.thisWeekStart).toBe('2026-08-31 (Monday)');
    expect(bounds.thisWeekEnd).toBe('2026-09-06 (Sunday)');
    expect(bounds.nextWeekStart).toBe('2026-09-07 (Monday)');
    expect(bounds.nextWeekEnd).toBe('2026-09-13 (Sunday)');
  });

  it('treats a Sunday as the last day of "this week", not the first of "next"', () => {
    // 2026-09-06 is Sunday — "next week" must start tomorrow (Mon 09-07),
    // not later. Regression for the Mon-Sun convention.
    const bounds = weekBoundsAround(new Date('2026-09-06T12:00:00+02:00'), 'Europe/Warsaw');
    expect(bounds.thisWeekStart).toBe('2026-08-31 (Monday)');
    expect(bounds.thisWeekEnd).toBe('2026-09-06 (Sunday)');
    expect(bounds.nextWeekStart).toBe('2026-09-07 (Monday)');
  });

  it('treats a Monday as the first day of "this week"', () => {
    const bounds = weekBoundsAround(new Date('2026-08-31T09:00:00+02:00'), 'Europe/Warsaw');
    expect(bounds.thisWeekStart).toBe('2026-08-31 (Monday)');
    expect(bounds.thisWeekEnd).toBe('2026-09-06 (Sunday)');
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
