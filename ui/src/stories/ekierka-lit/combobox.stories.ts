import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EklComboboxComponent } from '@ekierka/lit-angular';
import { LitComboboxFormHarness } from './combobox-form.harness';

const OPTIONS = [
  { value: 'health', label: 'Health' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
];

const meta: Meta<EklComboboxComponent> = {
  title: 'Ekierka (Lit)/Combobox',
  component: EklComboboxComponent,
  decorators: [moduleMetadata({ imports: [EklComboboxComponent, LitComboboxFormHarness] })],
};
export default meta;

type Story = StoryObj<EklComboboxComponent>;

export const Playground: Story = {
  render: () => ({
    props: { options: OPTIONS },
    template: `
      <div style="padding:24px;max-width:320px">
        <ekl-combobox label="Category" placeholder="No category" [options]="options" />
      </div>
    `,
  }),
};

// Spike: the generated wrapper is the signal-forms control; options change at runtime, inside a
// box that would clip a list that isn't in the top layer.
export const InASignalForm: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:360px"><app-lit-combobox-form-harness /></div>`,
  }),
};
