import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Progress' };
export default meta;

type Story = StoryObj;

export const Determinate: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:16px;padding:24px;max-width:360px">
        <progress class="ek-progress" aria-label="Empty" value="0" max="100"></progress>
        <progress class="ek-progress" aria-label="Half" value="50" max="100"></progress>
        <progress class="ek-progress" aria-label="Full" value="100" max="100"></progress>
      </div>`,
  }),
};

export const Indeterminate: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:360px"><progress class="ek-progress" aria-label="Loading" max="100"></progress></div>`,
  }),
};
