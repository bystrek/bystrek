import { describe, expect, it } from 'bun:test';
import { describeDates, parseReferencedDates, weekBoundsAround } from './calendar-ask.dates';

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

describe('describeDates', () => {
  it('lists the first occurrence of each weekday with relative labels on the first two days', () => {
    const lines = describeDates(new Date('2026-03-02T09:00:00+01:00'), 'Europe/Warsaw');
    expect(lines[0]).toBe('Now: Mon 2026-03-02 09:00');
    expect(lines[1].startsWith('Dates: Mon 2026-03-02 (today), Tue 2026-03-03 (tomorrow), ')).toBe(
      true,
    );
    expect(lines[2].startsWith('Weekdays: Mon=2026-03-02, Tue=2026-03-03, Wed=2026-03-04')).toBe(
      true,
    );
    expect(lines[3]).toBe(
      'This week: 2026-03-02 (Monday) to 2026-03-08 (Sunday). Next week: 2026-03-09 (Monday) to 2026-03-15 (Sunday).',
    );
  });

  it('appends referenced dates outside the window to the Dates line once', () => {
    const lines = describeDates(new Date('2026-03-02T09:00:00+01:00'), 'Europe/Warsaw', [
      '2026-04-10',
      '2026-03-03',
    ]);
    expect(lines[1].endsWith(', Fri 2026-04-10')).toBe(true);
    expect(lines[1].match(/2026-03-03/g)).toHaveLength(1);
  });
});

describe('parseReferencedDates', () => {
  it('keeps real, unique ISO dates and drops malformed or impossible ones', () => {
    expect(
      parseReferencedDates(
        '{"dates":["2026-11-10","2026-11-10","2026-02-30","Oct 10","2026-12-01","2026-12-02"]}',
      ),
    ).toEqual(['2026-11-10', '2026-12-01', '2026-12-02']);
  });

  it('returns no dates for a malformed discovery reply', () => {
    expect(parseReferencedDates('not json')).toEqual([]);
    expect(parseReferencedDates('{"dates":"2026-11-10"}')).toEqual([]);
  });
});
