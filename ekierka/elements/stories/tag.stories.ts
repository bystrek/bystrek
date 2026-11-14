import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Tag' };
export default meta;

type Story = StoryObj;

export const Variants: Story = {
  render: () => ({
    template: `
      <div style="display:flex;gap:16px;align-items:center;padding:24px">
        <span class="ek-tag">Solid</span>
        <span class="ek-tag" data-variant="outline">Outline</span>
        <span class="ek-tag" data-variant="boxed">Boxed</span>
        <span class="ek-tag" data-variant="outline"><svg viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M229.7 77.7l-128 128a8 8 0 0 1-11.4 0l-56-56a8 8 0 0 1 11.4-11.4L96 188.7 218.3 66.3a8 8 0 0 1 11.4 11.4z"/></svg> Visited</span>
      </div>`,
  }),
};
