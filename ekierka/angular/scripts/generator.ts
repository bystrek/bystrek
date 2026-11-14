// Turns a Custom Elements Manifest into Angular wrappers: one standalone component per element.
// Pure (manifest in, files out) so tests can snapshot and compile the output. The contract is in
// bystrek/bystrek#181.
import { format } from 'prettier';

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
interface Event {
  name: string;
  description?: string;
  type?: { text: string };
}
interface Element {
  name: string;
  tagName?: string;
  description?: string;
  members?: Field[];
  events?: Event[];
}
export interface Manifest {
  modules: { declarations?: Element[] }[];
}

const PACKAGE = '@ekierka/elements';
const VALUE_EVENT = 'ek-value-change';
// Field state that signal forms push into a control that declares a matching input.
const FIELD_STATE = new Set(['disabled', 'readonly', 'invalid', 'required', 'touched']);
// A default we can copy into a signal input's initial value.
const PLAIN_LITERAL =
  /^(true|false|null|undefined|-?\d+(\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/;

const camel = (kebab: string) => kebab.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const changeEvent = (property: string) =>
  `ek-${property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-change`;
const doc = (text: string | undefined, indent = '  ') =>
  text
    ? `${indent}/**\n${text
        .replaceAll('*/', '*\\/')
        .split('\n')
        .map((l) => `${indent} * ${l}`.trimEnd())
        .join('\n')}\n${indent} */\n`
    : '';
// TypeScript's own utility types; runtime globals like CustomEvent are caught by `in globalThis`.
const BUILT_IN_TYPES = new Set([
  'Partial',
  'Required',
  'Readonly',
  'Record',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'ReturnType',
  'Parameters',
  'Awaited',
  'ReadonlyArray',
  'ReadonlyMap',
  'ReadonlySet',
  'Uppercase',
  'Lowercase',
  'Capitalize',
  'Uncapitalize',
]);
// Type names used in event types, imported from the package. String literals are skipped.
const typeNames = (text: string) =>
  [...text.replace(/(['"`])(?:(?!\1).)*\1/g, '').matchAll(/\b[A-Z]\w*/g)]
    .map((m) => m[0])
    .filter((n) => !(n in globalThis) && !BUILT_IN_TYPES.has(n));

export function elementsOf(manifest: Manifest): Element[] {
  return manifest.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
}

/** Throws on a manifest that breaks the conventions the wrappers rely on. */
function check(el: Element, props: Field[], events: Event[]): void {
  const fail = (why: string): never => {
    throw new Error(`${el.name} (<${el.tagName}>): ${why}`);
  };
  if (!el.tagName?.startsWith('ek-')) fail(`tag names start with "ek-"`);
  for (const e of events) {
    const change = /^ek-(.+)-change$/.exec(e.name);
    const property = change && camel(change[1]);
    if (property && !props.some((p) => p.name === property))
      fail(`event ${e.name} needs a "${property}" property`);
  }
  for (const p of props) {
    if (p.default !== undefined && !PLAIN_LITERAL.test(p.default))
      fail(`default of "${p.name}" is \`${p.default}\`, not a plain literal`);
  }
  const isControl = events.some((e) => e.name === VALUE_EVENT);
  if (isControl && !props.some((p) => p.name === 'value')) fail(`${VALUE_EVENT} needs a "value"`);
  if (isControl && props.find((p) => p.name === 'value')?.default === undefined)
    fail(`a control's "value" needs a plain literal default`);
}

function wrapper(el: Element): string {
  const props = (el.members ?? []).filter(
    (f) =>
      f.kind === 'field' &&
      (!f.privacy || f.privacy === 'public') &&
      !f.static &&
      !f.readonly &&
      !f.name.startsWith('_'),
  );
  const events = el.events ?? [];
  check(el, props, events);

  const isControl =
    props.some((p) => p.name === 'value') && events.some((e) => e.name === VALUE_EVENT);
  const cls = el.name;
  const types = new Set(events.flatMap((e) => typeNames(e.type?.text ?? '')));

  // A property with an `ek-<property>-change` event is two-way: a model, so `[(open)]` works.
  const models = new Set(
    props.filter((p) => events.some((e) => e.name === changeEvent(p.name))).map((p) => p.name),
  );
  const modelOf = (event: string) => [...models].find((m) => changeEvent(m) === event);

  const inputs = props.map((p) => {
    const host = `Host['${p.name}']`;
    const initial = p.default ?? 'undefined';
    const comment = doc(p.description);
    if (models.has(p.name)) {
      // A control's `value` keeps the exact type FormValueControl asks for.
      const type = isControl && p.name === 'value' ? host : `${host} | undefined`;
      return `${comment}  readonly ${p.name} = model<${type}>(${initial});`;
    }
    if (isControl && p.name === 'name') return `${comment}  readonly name = input<string>('');`;
    if (isControl && p.name === 'errors')
      return `${comment}  readonly errors = input<readonly ValidationError.WithOptionalField[]>([]);`;
    if (p.type?.text === 'boolean')
      return `${comment}  readonly ${p.name} = input<boolean, unknown>(${p.default ?? 'false'}, { transform: booleanAttribute });`;
    return `${comment}  readonly ${p.name} = input<${host} | undefined>(${initial});`;
  });
  const outputs = events.map(
    (e) =>
      `${doc(e.description)}  readonly ${camel(e.name)} = output<${e.type?.text ?? 'Event'}>();`,
  );
  const host = events.map((e) => {
    const m = modelOf(e.name);
    return m
      ? `'(${e.name})': '${m}.set(element.${m}); emit(${camel(e.name)}, $event)'`
      : `'(${e.name})': 'emit(${camel(e.name)}, $event)'`;
  });
  if (isControl) host.push(`'(focusout)': 'touch.emit()'`);

  const forms = [
    isControl && 'type FormValueControl',
    isControl && props.some((p) => p.name === 'errors') && 'type ValidationError',
  ].filter(Boolean);

  const source = [...inputs, ...outputs].join('\n');
  const angularCore = [
    /transform: booleanAttribute/.test(source) && 'booleanAttribute',
    'ChangeDetectionStrategy',
    'Component',
    'ElementRef',
    'inject',
    /\binput[<(]/.test(source) && 'input',
    models.size > 0 && 'model',
    (events.length > 0 || isControl) && 'output',
    events.length > 0 && 'type OutputEmitterRef',
  ].filter(Boolean);

  return `// Generated from custom-elements.json by scripts/generate.ts. Do not edit.
import { ${angularCore.join(', ')} } from '@angular/core';
${forms.length ? `import { ${forms.join(', ')} } from '@angular/forms/signals';\n` : ''}import { define${cls}, type ${cls} as Host${[...types].map((t) => `, type ${t}`).join('')} } from '${PACKAGE}';
import { forwardInputs } from '../forward-inputs';

${doc(el.description, '')}@Component({
  selector: '${el.tagName}',
  template: '${isControl ? '' : '<ng-content />'}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ${host.join(', ')} },
})
export class ${cls}Component${isControl ? ` implements FormValueControl<Host['value']>` : ''} {
  protected readonly element = inject<ElementRef<Host>>(ElementRef).nativeElement;

${inputs.join('\n')}

${outputs.join('\n')}
${isControl ? `  /** Signal forms: the user has interacted with the field. */\n  readonly touch = output<void>();\n` : ''}
  constructor() {
    define${cls}();
    forwardInputs(this, this.element, [${props.map((p) => `'${p.name}'`).join(', ')}]);
  }

${
  events.length
    ? `  // Host listeners only know \`Event\`; the output carries the type the element documents.
  protected emit<T extends Event>(target: OutputEmitterRef<T>, event: Event): void {
    target.emit(event as T);
  }
`
    : ''
}}
`;
}

/** File name → formatted source for every wrapper plus the barrel. */
export async function generate(manifest: Manifest): Promise<Record<string, string>> {
  const elements = elementsOf(manifest);
  const files = {
    ...Object.fromEntries(elements.map((el) => [`${el.tagName}.ts`, wrapper(el)])),
    'index.ts':
      elements.map((el) => `export { ${el.name}Component } from './${el.tagName}';`).join('\n') ||
      'export {};',
  };
  const options = {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
  } as const;
  return Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([name, src]) => [name, await format(src, options)]),
    ),
  );
}
