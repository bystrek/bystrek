import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EkSegmentedControl } from '@ekierka/angular';

const OPTIONS = [
  { value: 'ask', label: 'ask' },
  { value: 'log', label: 'log' },
];

// The Stencil element through its generated Angular wrapper, as ui uses it.
const meta: Meta<EkSegmentedControl> = {
  title: 'Ekierka/Segmented control',
  component: EkSegmentedControl,
  decorators: [moduleMetadata({ imports: [EkSegmentedControl] })],
  args: { label: 'Bar mode', options: OPTIONS, value: 'ask', disabled: false },
  argTypes: {
    value: { control: 'inline-radio', options: OPTIONS.map((o) => o.value) },
  },
};
export default meta;

type Story = StoryObj<EkSegmentedControl>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="padding:24px">
        <ek-segmented-control [label]="label" [options]="options" [value]="value" [disabled]="disabled" />
      </div>
    `,
  }),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: Playground.render,
};
