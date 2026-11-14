// Generates Angular wrappers for the Lit elements from custom-elements.json:
// one standalone component per element, with typed signal inputs for its properties, outputs for
// its events, and registration on first use. An element with a `value` property that fires
// `ek-value-change` becomes a signal-forms custom control (`FormValueControl`): a `value` model,
// the field-state inputs it declares, and `touch` on focusout.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Field {
  kind: string;
  name: string;
  privacy?: string;
  static?: boolean;
  readonly?: boolean;
  default?: string;
  description?: string;
  type?: { text: string };
}
interface Element {
  name: string;
  tagName: string;
  description?: string;
  members?: Field[];
  events?: { name: string; description?: string; type?: { text: string } }[];
}

const PACKAGE = '@ekierka/lit';
const OUT = join(import.meta.dir, '../../lit-angular/src/generated');
const VALUE_EVENT = 'ek-value-change';
// Field state signal forms push into a custom control when it declares a matching input.
const FIELD_STATE = new Set(['disabled', 'readonly', 'hidden', 'invalid', 'pending', 'required']);

const manifest = JSON.parse(readFileSync(join(import.meta.dir, '../custom-elements.json'), 'utf8'));
const elements: Element[] = manifest.modules.flatMap((m: { declarations?: Element[] }) =>
  (m.declarations ?? []).filter((d) => d.tagName),
);

const camel = (kebab: string) => kebab.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const doc = (text?: string) =>
  text
    ? `/**\n${text
        .split('\n')
        .map((l) => `   * ${l}`.trimEnd())
        .join('\n')}\n   */\n  `
    : '';
const changeEvent = (property: string) =>
  `ek-${property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-change`;
// Type names used in event types, imported from the package (globals like CustomEvent excluded).
const typeNames = (text: string) =>
  [...text.matchAll(/\b[A-Z]\w*/g)].map((m) => m[0]).filter((n) => !(n in globalThis));

function wrapper(el: Element): string {
  const props = (el.members ?? []).filter(
    (f) => f.kind === 'field' && !f.privacy && !f.static && !f.readonly && !f.name.startsWith('_'),
  );
  const events = el.events ?? [];
  const isControl =
    props.some((p) => p.name === 'value') && events.some((e) => e.name === VALUE_EVENT);
  const cls = el.name;
  const define = `define${cls}`;
  const types = new Set(events.flatMap((e) => typeNames(e.type?.text ?? '')));

  // A property with an `ek-<property>-change` event is two-way: a model, so `[(open)]` works.
  // `value` with `ek-value-change` is the same rule; it also makes the element a form control.
  const models = new Set(
    props.filter((p) => events.some((e) => e.name === changeEvent(p.name))).map((p) => p.name),
  );
  const modelOf = (event: string) => [...models].find((m) => changeEvent(m) === event);

  const inputs = props.map((p) => {
    const t = `Host['${p.name}']`;
    if (models.has(p.name))
      return `${doc(p.description)}readonly ${p.name} = model<${t}>(${p.default ?? 'undefined'});`;
    if (isControl && p.name === 'name')
      return `${doc(p.description)}readonly name = input<string>('');`;
    if (p.type?.text === 'boolean')
      return `${doc(p.description)}readonly ${p.name} = input<boolean, unknown>(${p.default ?? 'false'}, { transform: booleanAttribute });`;
    if (isControl && FIELD_STATE.has(p.name))
      return `readonly ${p.name} = input<boolean>(${p.default ?? 'false'});`;
    return `${doc(p.description)}readonly ${p.name} = input<${t} | undefined>();`;
  });
  const outputs = events.map(
    (e) => `${doc(e.description)}readonly ${camel(e.name)} = output<${e.type?.text ?? 'Event'}>();`,
  );
  const host = events.map((e) => {
    const m = modelOf(e.name);
    return m
      ? `'(${e.name})': '${m}.set(element.${m}); emit(${camel(e.name)}, $event)'`
      : `'(${e.name})': 'emit(${camel(e.name)}, $event)'`;
  });
  if (isControl) host.push(`'(focusout)': 'touch.emit()'`);

  return `// Generated from custom-elements.json by ekierka/lit/scripts/generate-angular.ts. Do not edit.
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
  output,
  type OutputEmitterRef,
} from '@angular/core';
${isControl ? `import type { FormValueControl } from '@angular/forms/signals';\n` : ''}import { ${define}, type ${cls} as Host${[...types].map((t) => `, type ${t}`).join('')} } from '${PACKAGE}';
import { forwardInputs } from '../forward-inputs';

${doc(el.description).trimEnd()}
@Component({
  selector: '${el.tagName}',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ${host.join(', ')} },
})
export class ${cls}Component${isControl ? ` implements FormValueControl<Host['value']>` : ''} {
  protected readonly element = inject<ElementRef<Host>>(ElementRef).nativeElement;

  ${inputs.join('\n  ')}

  ${outputs.join('\n  ')}
  ${isControl ? `/** Signal forms: the user has interacted with the field. */\n  readonly touch = output<void>();\n` : ''}
  constructor() {
    ${define}();
    forwardInputs(this, this.element, [${props.map((p) => `'${p.name}'`).join(', ')}]);
  }

  // Host listeners only know \`Event\`; the output carries the type the element documents.
  protected emit<T extends Event>(target: OutputEmitterRef<T>, event: Event): void {
    target.emit(event as T);
  }
}
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const el of elements) writeFileSync(join(OUT, `${el.tagName}.ts`), wrapper(el));
writeFileSync(
  join(OUT, 'index.ts'),
  elements.map((el) => `export { ${el.name}Component } from './${el.tagName}';`).join('\n') + '\n',
);
Bun.spawnSync(['bunx', 'prettier', '--write', OUT], { stdout: 'ignore' });
console.log(`generated Angular wrappers for ${elements.map((e) => e.tagName).join(', ')}`);
