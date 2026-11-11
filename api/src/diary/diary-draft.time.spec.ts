import { describe, expect, it } from 'bun:test';
import { describeLocalTime, intoPast, localTimeToDate } from './diary-draft.time';

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

describe('intoPast', () => {
  // Tuesday 2026-11-10 06:30 in Warsaw.
  const capturedAt = new Date('2026-11-10T05:30:00Z');
  const run = (wallClock: string, at = capturedAt) =>
    intoPast(localTimeToDate(wallClock, WARSAW)!, at, WARSAW);

  it('reads a future morning hour as the evening before', () => {
    expect(run('2026-11-10T07:00')).toEqual(localTimeToDate('2026-11-09T19:00', WARSAW)!);
  });

  it('reads a future afternoon hour as the day before', () => {
    expect(run('2026-11-10T19:00')).toEqual(localTimeToDate('2026-11-09T19:00', WARSAW)!);
  });

  it('goes back a whole day when the evening before is still in the future', () => {
    // At 13:00, "09:00 tomorrow" minus 12 hours would be 21:00 today.
    const noon = localTimeToDate('2026-11-10T13:00', WARSAW)!;
    expect(run('2026-11-11T09:00', noon)).toEqual(localTimeToDate('2026-11-10T09:00', WARSAW)!);
  });

  it('keeps the wall-clock hour across a DST change', () => {
    // Sunday 2026-10-25 06:30, the morning after clocks went back.
    const morning = localTimeToDate('2026-10-25T06:30', WARSAW)!;
    expect(run('2026-10-25T07:00', morning)).toEqual(localTimeToDate('2026-10-24T19:00', WARSAW)!);
  });

  it('leaves past times, clock skew and times over a day ahead alone', () => {
    expect(run('2026-11-10T06:00')).toEqual(localTimeToDate('2026-11-10T06:00', WARSAW)!);
    expect(run('2026-11-10T06:34')).toEqual(localTimeToDate('2026-11-10T06:34', WARSAW)!);
    expect(run('2026-11-12T07:00')).toEqual(localTimeToDate('2026-11-12T07:00', WARSAW)!);
  });
});
