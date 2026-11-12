import { describe, expect, it } from 'bun:test';
import { healthDate, healthDay } from './health-date';

describe('healthDate', () => {
  it('reads the offset the timestamp carries', () => {
    expect(healthDate.parse('2024-02-06 14:30:00 -0800').toISOString()).toBe(
      '2024-02-06T22:30:00.000Z',
    );
    expect(healthDate.parse('2026-11-10 07:00:00 +0100').toISOString()).toBe(
      '2026-11-10T06:00:00.000Z',
    );
  });

  it('rejects other formats and impossible dates', () => {
    for (const value of [
      '2024-02-06T14:30:00-08:00',
      '2024-02-06 14:30:00',
      '2024-02-30 10:00:00 +0000',
    ]) {
      expect(healthDate.safeParse(value).success).toBe(false);
    }
  });
});

describe('healthDay', () => {
  it("is the phone's calendar day, whatever the offset", () => {
    expect(healthDay.parse('2026-11-10 00:00:00 +0100')).toBe('2026-11-10');
  });

  it('rejects impossible dates', () => {
    expect(healthDay.safeParse('2024-02-30 00:00:00 +0000').success).toBe(false);
  });
});
