import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Icon } from '../icon/icon';
import { Button } from './button';

const meta: Meta<Button> = {
  title: 'Primitives/Button',
  component: Button,
  decorators: [moduleMetadata({ imports: [Icon] })],
  args: { variant: 'surface', shape: 'default', block: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['surface', 'primary', 'inverse'] },
    shape: { control: 'inline-radio', options: ['default', 'icon'] },
  },
};
export default meta;

type Story = StoryObj<Button>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<button appButton [variant]="variant" [shape]="shape" [block]="block">Jump to Fri 23 Oct</button>`,
  }),
};

const matrix = (extra: string, wrapper = '') => ({
  props: { variants: ['surface', 'primary', 'inverse'] },
  template: `
    <div ${wrapper} style="display:grid;gap:24px;padding:24px;justify-items:start">
      @for (v of variants; track v) {
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <code style="width:70px;font:500 12px var(--font-mono)">{{ v }}</code>
          ${extra}
        </div>
      }
    </div>
  `,
});

export const Variants: Story = {
  render: () =>
    matrix(`
      <button appButton [variant]="v">Default</button>
      <button appButton [variant]="v" shape="icon" aria-label="Next"><app-icon name="chevron-right" /></button>
      <button appButton [variant]="v"><app-icon name="arrow-right" /> With icon</button>
    `),
};

export const Disabled: Story = {
  render: () =>
    matrix(`
      <button appButton [variant]="v" disabled>Disabled</button>
      <button appButton [variant]="v" shape="icon" disabled aria-label="Next"><app-icon name="chevron-right" /></button>
      <a appButton [variant]="v" href="#" aria-disabled="true">Disabled link</a>
    `),
};

export const Busy: Story = {
  render: () =>
    matrix(`
      <button appButton [variant]="v" aria-busy="true">Busy</button>
      <button appButton [variant]="v" shape="icon" aria-busy="true" aria-label="Stop"><app-icon name="stop" /></button>
    `),
};

export const AsLink: Story = {
  render: () =>
    matrix(`
      <a appButton [variant]="v" href="#">Link button</a>
      <a appButton [variant]="v" shape="icon" href="#" aria-label="Close"><app-icon name="x" /></a>
    `),
};

export const Block: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:16px;padding:24px;max-width:360px">
        <button appButton variant="surface" block>Surface block</button>
        <button appButton variant="primary" block>Primary block</button>
        <button appButton variant="inverse" block>Jump to Fri 23 Oct <app-icon name="arrow-right" /></button>
      </div>
    `,
  }),
};

export const Quiet: Story = {
  render: () =>
    matrix(
      `
      <button appButton [variant]="v">Default</button>
      <button appButton [variant]="v" shape="icon" aria-label="Next"><app-icon name="chevron-right" /></button>
    `,
      'data-quiet',
    ),
};

export const FocusVisible: Story = {
  render: () => ({
    template: `
      <div style="padding:24px"><button appButton variant="primary">Focused</button></div>
    `,
  }),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>('button')?.focus();
  },
};
