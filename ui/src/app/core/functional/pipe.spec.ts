import { pipe } from './pipe';

describe('pipe', () => {
  it('returns the value unchanged with no steps', () => {
    expect(pipe(3)).toBe(3);
  });

  it('feeds each step the previous output, in order', () => {
    const result = pipe(
      2,
      (n: number) => n + 1,
      (n: number) => `value ${n}`,
      (s: string) => s.length,
      (len: number) => len * 10,
    );

    expect(result).toBe(70);
  });
});
