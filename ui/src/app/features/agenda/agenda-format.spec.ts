import { clockTime, formatDuration } from './agenda-format';

describe('agenda format', () => {
  it('formats durations for free gaps', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(150)).toBe('2h 30m');
  });

  it('reads the wall-clock time without converting the offset', () => {
    expect(clockTime('2025-10-22T09:05:00+02:00')).toBe('09:05');
  });
});
