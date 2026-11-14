import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './generator';

const manifest = JSON.parse(
  readFileSync(join(import.meta.dir, '../../elements/custom-elements.json'), 'utf8'),
);
const out = join(import.meta.dir, '../src/generated');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = await generate(manifest);
for (const [name, source] of Object.entries(files)) writeFileSync(join(out, name), source);
console.log(`generated ${Object.keys(files).length - 1} Angular wrappers`);
