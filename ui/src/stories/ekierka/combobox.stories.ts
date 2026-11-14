import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EkCombobox } from '@ekierka/angular';
import { ComboboxFormHarness } from './combobox-form.harness';

const OPTIONS = [
  { value: 'health', label: 'Health' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
];

const meta: Meta<EkCombobox> = {
  title: 'Ekierka/Combobox',
  component: EkCombobox,
  decorators: [moduleMetadata({ imports: [EkCombobox, ComboboxFormHarness] })],
  args: { label: 'Category', placeholder: 'No category', options: OPTIONS, disabled: false },
};
export default meta;

type Story = StoryObj<EkCombobox>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="padding:24px;max-width:320px">
        <ek-combobox [label]="label" [placeholder]="placeholder" [options]="options" [disabled]="disabled" />
      </div>
    `,
  }),
};

// Spike: bound to a signal form field, options changing at runtime, inside a box that would
// clip a list that isn't in the top layer.
export const InASignalForm: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:360px"><app-combobox-form-harness /></div>`,
  }),
};
