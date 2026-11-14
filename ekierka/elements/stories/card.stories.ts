import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Card' };
export default meta;

type Story = StoryObj;

export const Tones: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:16px;padding:24px;max-width:360px">
        <div class="ek-card">Surface</div>
        <div class="ek-card" data-tone="primary">Primary</div>
        <div class="ek-card" data-tone="danger">Danger</div>
        <div class="ek-card" data-weight="thin">Thin</div>
      </div>`,
  }),
};
