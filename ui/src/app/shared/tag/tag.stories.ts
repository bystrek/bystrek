import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ICON_NAMES } from '../icon/icon';
import { Tag } from './tag';

const meta: Meta<Tag> = {
  title: 'Primitives/Tag',
  component: Tag,
  decorators: [moduleMetadata({ imports: [Tag] })],
  args: { variant: 'solid' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['solid', 'outline', 'boxed'] },
    icon: { control: 'select', options: [undefined, ...ICON_NAMES] },
  },
};
export default meta;

type Story = StoryObj<Tag>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<div style="padding:24px"><app-tag [variant]="variant" [icon]="icon">Next · in 40 min</app-tag></div>`,
  }),
};

export const Variants: Story = {
  render: () => ({
    template: `
      <div style="display:flex;gap:16px;align-items:center;padding:24px;flex-wrap:wrap">
        <app-tag variant="solid">Answer</app-tag>
        <app-tag variant="outline">Next · in 40 min</app-tag>
        <app-tag variant="boxed">Fri 23 Oct · first event</app-tag>
      </div>
    `,
  }),
};

export const WithIcon: Story = {
  render: () => ({
    template: `
      <div style="display:flex;gap:16px;align-items:center;padding:24px;flex-wrap:wrap">
        <app-tag variant="solid" icon="clock">Next</app-tag>
        <app-tag variant="outline" icon="clock">Next</app-tag>
        <app-tag variant="boxed" icon="corner-down-right">Fri 23 Oct · first event</app-tag>
      </div>
    `,
  }),
};
