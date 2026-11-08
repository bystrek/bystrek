// Shared by the model evals: timing the real model and summarising the results.

import type { LlmClient, LlmJsonRequest } from '../src/llm/llm.client';

// Records each completion's latency and raw reply.
export class TimedLlmClient implements LlmClient {
  readonly timings: number[] = [];
  // Services replace model errors with a generic message, so keep the originals.
  readonly errors: string[] = [];
  readonly outputs: string[] = [];

  constructor(private readonly inner: LlmClient) {}

  reset(): void {
    this.timings.length = 0;
    this.errors.length = 0;
    this.outputs.length = 0;
  }

  async generateJson(request: LlmJsonRequest): Promise<string> {
    const started = performance.now();
    try {
      const output = await this.inner.generateJson(request);
      this.outputs.push(output);
      return output;
    } catch (err) {
      this.errors.push(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      this.timings.push(performance.now() - started);
    }
  }
}

export function intFlag(name: string, fallback: number): number {
  const flag = process.argv.indexOf(name);
  if (flag === -1) return fallback;
  const value = Number(process.argv[flag + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const mean = (values: number[]) => sum(values) / values.length;
export const round = (ms: number) => Math.round(ms);

export function passRate(results: { pass: boolean }[]): string {
  return `${results.filter((r) => r.pass).length}/${results.length}`;
}

export function groupBy<T>(results: T[], key: (r: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const result of results) {
    const group = groups.get(key(result)) ?? [];
    group.push(result);
    groups.set(key(result), group);
  }
  return groups;
}

// Accuracy, then warm latency: the first call after a model load pays for the uncached
// system prompt, so it stays out of the latency figures.
export function printSummary(
  results: { pass: boolean; calls: number; modelMs: number; totalMs: number }[],
): void {
  const warm = results.slice(1);
  const passed = results.filter((r) => r.pass).length;
  console.log(
    `\naccuracy: ${passed}/${results.length} (${((100 * passed) / results.length).toFixed(1)}%)`,
  );
  if (warm.length > 0) {
    const totals = warm.map((r) => r.totalMs);
    console.log(
      `latency ms (warm): total median=${round(median(totals))} mean=${round(mean(totals))} ` +
        `p90=${round(percentile(totals, 90))} max=${round(Math.max(...totals))} | ` +
        `model calls per prompt=${(sum(warm.map((r) => r.calls)) / warm.length).toFixed(1)} ` +
        `model ms mean=${round(mean(warm.map((r) => r.modelMs)))}`,
    );
  }
}
