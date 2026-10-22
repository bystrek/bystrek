import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ICON_NAMES, Icon } from './icon';

const meta: Meta<Icon> = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'arrow-right' },
  argTypes: { name: { control: 'select', options: ICON_NAMES } },
};
export default meta;

type Story = StoryObj<Icon>;

export const Playground: Story = {};

export const AllIcons: Story = {
  render: () => ({
    props: { names: ICON_NAMES },
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,120px);gap:16px;padding:16px">
        @for (n of names; track n) {
          <div style="display:grid;justify-items:center;gap:8px;font:500 12px var(--font-mono)">
            <app-icon [name]="n" style="font-size:32px" />
            <code>{{ n }}</code>
          </div>
        }
      </div>
    `,
  }),
};

export const Sizes: Story = {
  render: () => ({
    template: `
      <div style="display:flex;gap:16px;align-items:center;padding:16px">
        <app-icon name="calendar" style="font-size:16px" />
        <app-icon name="calendar" style="font-size:24px" />
        <app-icon name="calendar" style="font-size:32px" />
        <app-icon name="calendar" style="font-size:48px" />
      </div>
    `,
  }),
};
