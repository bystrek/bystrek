import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate, type Manifest } from '../scripts/generator';
import fixture from './fixtures/manifest.json';

const manifest = fixture as Manifest;
const withElement = (patch: (el: Record<string, any>) => void): Manifest => {
  const copy = structuredClone(fixture) as any;
  patch(copy.modules[0].declarations[0]);
  return copy;
};

describe('generated wrappers', async () => {
  const files = await generate(manifest);

  test('match the snapshot', async () => {
    expect(files).toMatchSnapshot();
  });

  test('compile under strict TypeScript', async () => {
    const out = join(import.meta.dir, '.out');
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, 'generated'), { recursive: true });
    for (const [name, source] of Object.entries(files))
      writeFileSync(join(out, 'generated', name), source);
    writeFileSync(
      join(out, 'forward-inputs.ts'),
      await Bun.file(join(import.meta.dir, '../src/forward-inputs.ts')).text(),
    );
    writeFileSync(
      join(out, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['es2022', 'dom'],
          strict: true,
          noUnusedLocals: true,
          noImplicitOverride: true,
          noPropertyAccessFromIndexSignature: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
        },
        include: ['./**/*.ts', '../fixtures/elements.d.ts'],
      }),
    );
    const tsc = Bun.spawn(['bunx', 'tsc', '-p', join(out, 'tsconfig.json')], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(tsc.stdout).text();
    expect(output).toBe('');
    expect(await tsc.exited).toBe(0);
  }, 60_000);

  test('fail to compile a wrapper that breaks the contract', async () => {
    const out = join(import.meta.dir, '.out-broken');
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, 'broken.ts'),
      `import type { FormValueControl } from '@angular/forms/signals';
export class Broken implements FormValueControl<string> { readonly value = 'not a model'; }`,
    );
    writeFileSync(
      join(out, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          moduleResolution: 'bundler',
          module: 'esnext',
          types: [],
        },
        include: ['./broken.ts'],
      }),
    );
    const tsc = Bun.spawn(['bunx', 'tsc', '-p', join(out, 'tsconfig.json')], { stdout: 'ignore' });
    expect(await tsc.exited).not.toBe(0);
    rmSync(out, { recursive: true, force: true });
  }, 60_000);
});

describe('generator conventions', () => {
  test('an ek-*-change event without its property fails', async () => {
    const broken = withElement((el) => {
      el['events'].push({ name: 'ek-checked-change', type: { text: 'CustomEvent<boolean>' } });
    });
    await expect(generate(broken)).rejects.toThrow(/ek-checked-change needs a "checked" property/);
  });

  test('a control without value fails', async () => {
    const broken = withElement((el) => {
      el['members'] = el['members'].filter((m: { name: string }) => m.name !== 'value');
    });
    await expect(generate(broken)).rejects.toThrow(/ek-value-change needs a "value"/);
  });

  test('a default that is not a plain literal fails', async () => {
    const broken = withElement((el) => {
      el['members'].push({
        kind: 'field',
        name: 'items',
        type: { text: 'string[]' },
        default: '[]',
      });
    });
    await expect(generate(broken)).rejects.toThrow(
      /default of "items" is `\[\]`, not a plain literal/,
    );
  });

  test('a tag without the ek- prefix fails', async () => {
    const broken = withElement((el) => {
      el['tagName'] = 'my-switch';
    });
    await expect(generate(broken)).rejects.toThrow(/start with "ek-"/);
  });

  test('an empty manifest generates an empty barrel', async () => {
    expect(await generate({ modules: [] })).toEqual({ 'index.ts': 'export {};\n' });
  });
});
