import * as combobox from '@zag-js/combobox';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { CARET_DOWN_BOLD } from '../icons.js';
import { adoptDocumentStyles } from '../styles.js';
import { spread } from '../zag/spread.js';
import { ZagController } from '../zag/zag-controller.js';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxChange {
  value: string | null;
}

const styles = css`
  @scope (ekl-combobox) {
    :scope {
      display: block;
    }

    .label {
      display: block;
      margin-bottom: var(--space-1);
      font: 700 var(--text-xs) / 1.2 var(--font-mono);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
    }

    .control {
      display: flex;
      border: var(--border-heavy);
      background: var(--color-surface);
    }

    .control:focus-within {
      outline: var(--focus-ring);
      outline-offset: var(--focus-offset);
    }

    .input {
      flex: 1;
      min-width: 0;
      min-height: var(--tap);
      margin: 0;
      padding: 0 var(--space-3);
      border: 0;
      outline: none;
      background: transparent;
      color: var(--color-ink);
      font: 500 var(--text-md) / 1 var(--font-ui);
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--tap);
      margin: 0;
      padding: 0;
      border: 0;
      border-left: var(--border-heavy);
      background: var(--color-surface);
      color: var(--color-ink);
      cursor: pointer;
    }

    .icon {
      display: inline-flex;
      width: 1em;
      height: 1em;
      font-size: var(--text-lg);
    }

    .icon svg {
      width: 100%;
      height: 100%;
    }

    [data-disabled] .input,
    [data-disabled] .trigger {
      color: var(--color-ink-subtle);
      cursor: not-allowed;
    }

    /* Popover UA styles would centre it with a border; Zag positions it. */
    .positioner {
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      overflow: visible;
    }

    .content {
      box-sizing: border-box;
      max-height: 240px;
      overflow-y: auto;
      margin: var(--space-1) 0 0;
      padding: 0;
      list-style: none;
      border: var(--border-heavy);
      background: var(--color-surface);
      box-shadow: var(--shadow);
    }

    .item,
    .empty {
      display: flex;
      align-items: center;
      min-height: var(--tap);
      padding: 0 var(--space-3);
      font: 500 var(--text-md) / 1.2 var(--font-ui);
    }

    .item {
      cursor: pointer;
    }

    .item[data-highlighted] {
      background: var(--color-ink);
      color: var(--color-surface);
    }

    .item[data-state='checked'] {
      font-weight: 700;
    }

    .empty {
      color: var(--color-ink-subtle);
    }
  }
`;

let instances = 0;

const toCollection = (items: ComboboxOption[]) =>
  combobox.collection({
    items,
    itemToValue: (item) => item.value,
    itemToString: (item) => item.label,
  });

/**
 * A text input that filters a list of options and picks one. The list opens in the top layer
 * (the popover API), so no ancestor's overflow or stacking can clip it. Renders in light DOM, so
 * its ARIA id references and form behaviour work like any input on the page.
 *
 * @tagname ekl-combobox
 * @fires {CustomEvent<ComboboxChange>} ek-value-change - The user picked an option. `value` is updated by then.
 */
export class EklCombobox extends LitElement {
  @property() label = '';

  @property({ attribute: false }) options: ComboboxOption[] = [];

  /** The picked option's value. */
  @property({ attribute: false }) value: string | null = null;

  @property({ type: Boolean }) disabled = false;

  /** Marks the field invalid for assistive tech (`aria-invalid`) and styling (`data-invalid`). */
  @property({ type: Boolean }) invalid = false;

  @property({ type: Boolean }) required = false;

  @property() placeholder?: string;

  @property() name?: string;

  private readonly machineId = `ekl-combobox-${++instances}`;
  private filter = '';

  private visibleOptions(): ComboboxOption[] {
    const filter = this.filter.toLowerCase();
    return filter
      ? this.options.filter((o) => o.label.toLowerCase().includes(filter))
      : this.options;
  }

  private readonly zag = new ZagController(this, combobox.machine, () => ({
    id: this.machineId,
    name: this.name,
    disabled: this.disabled,
    invalid: this.invalid,
    required: this.required,
    placeholder: this.placeholder,
    value: this.value === null ? [] : [this.value],
    collection: toCollection(this.visibleOptions()),
    openOnClick: true,
    positioning: { strategy: 'fixed' as const, sameWidth: true },
    onInputValueChange: ({ inputValue, reason }) => {
      // Only typing filters; picking an option or reopening shows the whole list again.
      this.filter = reason === 'input-change' ? inputValue : '';
    },
    // Into the top layer before Zag measures, so floating-ui positions against the viewport
    // rather than a transformed ancestor. Zag itself only toggles `hidden` on the content.
    onOpenChange: ({ open }) =>
      this.querySelector<HTMLElement>('.positioner')?.togglePopover?.(open),
    onValueChange: ({ value }) => {
      this.value = value[0] ?? null;
      this.dispatchEvent(
        new CustomEvent<ComboboxChange>('ek-value-change', {
          detail: { value: this.value },
          bubbles: true,
        }),
      );
    },
  }));

  protected override createRenderRoot() {
    adoptDocumentStyles(styles);
    return this;
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.size) this.zag.refresh();
  }

  protected override render() {
    const api = this.zag.connect(combobox.connect);
    if (!api) return nothing;
    const items = api.collection.items;
    return html`
      <div ${spread(api.getRootProps())} class="root">
        <label ${spread(api.getLabelProps())} class="label">${this.label}</label>
        <div ${spread(api.getControlProps())} class="control">
          <input ${spread(api.getInputProps())} class="input" />
          <button ${spread(api.getTriggerProps())} class="trigger">
            <span class="icon" aria-hidden="true">${CARET_DOWN_BOLD}</span>
          </button>
        </div>
        <div ${spread(api.getPositionerProps())} class="positioner" popover="manual">
          <ul ${spread(api.getContentProps())} class="content">
            ${repeat(
              items,
              (item) => item.value,
              (item) => html`
                <li ${spread(api.getItemProps({ item }))} class="item">
                  <span ${spread(api.getItemTextProps({ item }))}>${item.label}</span>
                </li>
              `,
            )}
            ${items.length === 0 ? html`<li class="empty">No matches</li>` : nothing}
          </ul>
        </div>
      </div>
    `;
  }
}

export const defineEklCombobox = () =>
  customElements.get('ekl-combobox') ?? customElements.define('ekl-combobox', EklCombobox);
