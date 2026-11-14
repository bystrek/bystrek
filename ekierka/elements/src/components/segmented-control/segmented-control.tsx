import {
  Component,
  type ComponentInterface,
  Event,
  type EventEmitter,
  forceUpdate,
  h,
  Prop,
} from '@stencil/core';
import * as radio from '@zag-js/radio-group';
import { MachineController } from '../../zag/machine-controller';

export interface SegmentedControlOption {
  value: string;
  label: string;
}

export interface SegmentedControlChange {
  value: string | null;
}

let instances = 0;

/**
 * A row of mutually exclusive options. Native radio inputs underneath, so arrow keys move and
 * select, and the group is a single tab stop.
 */
@Component({
  tag: 'ek-segmented-control',
  styleUrl: 'segmented-control.css',
  scoped: true,
})
export class SegmentedControl implements ComponentInterface {
  /** The group's accessible name. Visually hidden. */
  @Prop() label!: string;

  @Prop() options: SegmentedControlOption[] = [];

  /** The selected option's value. Kept in sync when the user picks one. */
  @Prop({ mutable: true }) value: string | null = null;

  @Prop() disabled = false;

  /** Marks the field invalid for assistive tech (`aria-invalid`) and styling (`data-invalid`). */
  @Prop() invalid = false;

  @Prop() required = false;

  /** Name for the native radio inputs; defaults to a generated id. */
  @Prop() name?: string;

  /** Fired when the user picks an option. `value` is also updated by then. */
  @Event() ekValueChange!: EventEmitter<SegmentedControlChange>;

  private readonly id = `ek-segmented-control-${++instances}`;

  private readonly zag = new MachineController(
    radio.machine,
    () => ({
      id: this.id,
      name: this.name,
      value: this.value,
      disabled: this.disabled,
      invalid: this.invalid,
      required: this.required,
      orientation: 'horizontal' as const,
      onValueChange: ({ value }) => {
        this.value = value;
        this.ekValueChange.emit({ value });
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

  render() {
    const api = this.zag.connect(radio.connect);
    if (!api) return;
    return (
      <div {...api.getRootProps()} class="root">
        <span {...api.getLabelProps()} class="label">
          {this.label}
        </span>
        {this.options.map(({ value, label }) => (
          <label {...api.getItemProps({ value })} class="item" key={value}>
            <span {...api.getItemTextProps({ value })}>{label}</span>
            <input {...api.getItemHiddenInputProps({ value })} />
          </label>
        ))}
      </div>
    );
  }
}
