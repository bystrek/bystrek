import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Stack } from './stack';

const meta: Meta<Stack> = {
  title: 'Primitives/Stack',
  component: Stack,
  decorators: [moduleMetadata({ imports: [Stack] })],
  args: { direction: 'vertical', align: 'stretch', gap: 'space-3' },
  argTypes: {
    direction: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end', 'stretch'] },
    gap: { control: 'select', options: ['space-1', 'space-2', 'space-3', 'space-4', 'space-6'] },
  },
};
export default meta;

type Story = StoryObj<Stack>;

const box = `<div style="border:2px solid #111;padding:8px;background:#fff">Item</div>`;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<div style="padding:24px;max-width:420px"><app-stack [direction]="direction" [align]="align" [gap]="gap">${box}${box}${box}</app-stack></div>`,
  }),
};

export const Vertical: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:420px"><app-stack gap="space-2">${box}${box}${box}</app-stack></div>`,
  }),
};

export const Horizontal: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:420px"><app-stack direction="horizontal" align="center" gap="space-4">${box}${box}${box}</app-stack></div>`,
  }),
};
