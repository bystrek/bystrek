import {
  Component,
  type ComponentInterface,
  Event,
  type EventEmitter,
  forceUpdate,
  h,
  Prop,
} from '@stencil/core';
import * as combobox from '@zag-js/combobox';
import { CARET_DOWN_BOLD } from '../../icons';
import { MachineController } from '../../zag/machine-controller';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxChange {
  value: string | null;
}

let instances = 0;

const toCollection = (items: ComboboxOption[]) =>
  combobox.collection({
    items,
    itemToValue: (item) => item.value,
    itemToString: (item) => item.label,
  });

/**
 * A text input that filters a list of options and picks one. The list opens in the top layer
 * (the popover API), so no ancestor's overflow or stacking can clip it.
 */
@Component({
  tag: 'ek-combobox',
  styleUrl: 'combobox.css',
  scoped: true,
})
export class Combobox implements ComponentInterface {
  @Prop() label!: string;

  @Prop() options: ComboboxOption[] = [];

  /** The picked option's value. Kept in sync when the user picks one. */
  @Prop({ mutable: true }) value: string | null = null;

  @Prop() disabled = false;

  /** Marks the field invalid for assistive tech (`aria-invalid`) and styling (`data-invalid`). */
  @Prop() invalid = false;

  @Prop() required = false;

  @Prop() placeholder?: string;

  @Prop() name?: string;

  /** Fired when the user picks an option. `value` is also updated by then. */
  @Event() ekValueChange!: EventEmitter<ComboboxChange>;

  private readonly id = `ek-combobox-${++instances}`;
  private filter = '';
  private positioner?: HTMLElement;

  private visibleOptions(): ComboboxOption[] {
    const filter = this.filter.toLowerCase();
    return filter
      ? this.options.filter((o) => o.label.toLowerCase().includes(filter))
      : this.options;
  }

  private readonly zag = new MachineController(
    combobox.machine,
    () => ({
      id: this.id,
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
      onOpenChange: ({ open }) => this.positioner?.togglePopover?.(open),
      onValueChange: ({ value }) => {
        this.value = value[0] ?? null;
        this.ekValueChange.emit({ value: this.value });
      },
    }),
    () => forceUpdate(this),
  );

  connectedCallback() {
    this.zag.start();
  }

  disconnectedCallback() {
    this.zag.stop();
  }

  componentShouldUpdate() {
    this.zag.refresh();
    return true;
  }

  render() {
    const api = this.zag.connect(combobox.connect);
    if (!api) return;
    const items = api.collection.items;
    return (
      <div {...api.getRootProps()} class="root">
        <label {...api.getLabelProps()} class="label">
          {this.label}
        </label>
        <div {...api.getControlProps()} class="control">
          <input {...api.getInputProps()} class="input" />
          <button {...api.getTriggerProps()} class="trigger">
            <span class="icon" aria-hidden="true" innerHTML={CARET_DOWN_BOLD} />
          </button>
        </div>
        <div
          {...api.getPositionerProps()}
          class="positioner"
          popover="manual"
          ref={(el) => (this.positioner = el)}
        >
          <ul {...api.getContentProps()} class="content">
            {items.map((item) => (
              <li {...api.getItemProps({ item })} class="item" key={item.value}>
                <span {...api.getItemTextProps({ item })}>{item.label}</span>
              </li>
            ))}
            {items.length === 0 && <li class="empty">No matches</li>}
          </ul>
        </div>
      </div>
    );
  }
}
