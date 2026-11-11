import { describe, expect, it } from 'bun:test';
import { describeLocalTime, localTimeToDate } from './diary-draft.time';

const WARSAW = 'Europe/Warsaw';

describe('describeLocalTime', () => {
  it("shows the user's wall clock with its weekday", () => {
    expect(describeLocalTime(new Date('2026-11-10T07:30:00Z'), WARSAW)).toBe(
      'Tuesday 2026-11-10 08:30',
    );
  });

  it('crosses midnight in the user zone, not UTC', () => {
    expect(describeLocalTime(new Date('2026-11-10T23:15:00Z'), WARSAW)).toBe(
      'Wednesday 2026-11-11 00:15',
    );
  });
});

describe('localTimeToDate', () => {
  it('reads a wall-clock time in the user zone', () => {
    expect(localTimeToDate('2026-11-09T22:00', WARSAW)).toEqual(new Date('2026-11-09T21:00:00Z'));
    expect(localTimeToDate('2026-07-09T22:00:30', WARSAW)).toEqual(
      new Date('2026-07-09T20:00:30Z'),
    );
  });

  it('moves a time skipped by DST forward and takes the earlier of a repeated one', () => {
    expect(localTimeToDate('2026-03-29T02:30', WARSAW)).toEqual(new Date('2026-03-29T01:30:00Z'));
    expect(localTimeToDate('2026-10-25T02:30', WARSAW)).toEqual(new Date('2026-10-25T00:30:00Z'));
  });

  it('rejects offsets, dates without a time and impossible dates', () => {
    expect(localTimeToDate('2026-11-09T22:00Z', WARSAW)).toBeUndefined();
    expect(localTimeToDate('2026-11-09T22:00+01:00', WARSAW)).toBeUndefined();
    expect(localTimeToDate('2026-11-09', WARSAW)).toBeUndefined();
    expect(localTimeToDate('2026-02-30T08:00', WARSAW)).toBeUndefined();
    expect(localTimeToDate('2026-11-09T25:00', WARSAW)).toBeUndefined();
    expect(localTimeToDate('last night', WARSAW)).toBeUndefined();
  });
});
