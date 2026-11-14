import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Chip' };
export default meta;

type Story = StoryObj;

export const Tones: Story = {
  render: () => ({
    template: `
      <div style="display:flex;gap:16px;padding:24px">
        <button class="ek-chip">Secondary</button>
        <button class="ek-chip" data-tone="surface">Surface</button>
        <button class="ek-chip" disabled>Disabled</button>
      </div>`,
  }),
};
