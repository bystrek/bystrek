import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Chip } from './chip';

const meta: Meta<Chip> = {
  title: 'Primitives/Chip',
  component: Chip,
  args: { tone: 'secondary' },
  argTypes: { tone: { control: 'inline-radio', options: ['secondary', 'surface'] } },
};
export default meta;

type Story = StoryObj<Chip>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<div style="padding:24px"><button appChip [tone]="tone">what's my next meeting?</button></div>`,
  }),
};

export const TonesAndStates: Story = {
  render: () => ({
    props: { tones: ['secondary', 'surface'] },
    template: `
      <div style="display:grid;gap:16px;padding:24px;justify-items:start">
        @for (t of tones; track t) {
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <code style="width:80px;font:500 12px var(--font-mono)">{{ t }}</code>
            <button appChip [tone]="t">When is my dentist?</button>
            <button appChip [tone]="t" disabled>Disabled</button>
          </div>
        }
      </div>
    `,
  }),
};

export const Wrapping: Story = {
  render: () => ({
    template: `
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:24px;max-width:360px">
        <button appChip tone="surface">what's tomorrow?</button>
        <button appChip tone="surface">am I free Friday afternoon?</button>
        <button appChip tone="surface">next meeting</button>
      </div>
    `,
  }),
};

export const FocusVisible: Story = {
  render: () => ({ template: `<div style="padding:24px"><button appChip>Focused</button></div>` }),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>('button')?.focus();
  },
};
