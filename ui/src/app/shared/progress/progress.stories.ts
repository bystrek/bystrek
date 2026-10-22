import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Progress } from './progress';

const meta: Meta<Progress> = {
  title: 'Primitives/Progress',
  component: Progress,
  args: { label: 'Reading your calendar' },
  decorators: [
    (story) => ({
      ...story(),
      template: `<div style="padding:24px;max-width:360px">${story().template}</div>`,
    }),
  ],
};
export default meta;

type Story = StoryObj<Progress>;

export const Indeterminate: Story = {
  render: (args) => ({
    props: args,
    template: `<app-progress [label]="label" />`,
  }),
};

export const Determinate: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="display:grid;gap:16px">
        <app-progress [label]="label" [value]="0" />
        <app-progress [label]="label" [value]="40" />
        <app-progress [label]="label" [value]="100" />
      </div>
    `,
  }),
};

export const WithCaption: Story = {
  render: (args) => ({
    props: args,
    template: `
      <app-progress [label]="label" />
      <p style="margin:8px 0 0;font:500 12px var(--font-mono);letter-spacing:var(--tracking-caps);text-transform:uppercase">Reading your calendar…</p>
    `,
  }),
};
