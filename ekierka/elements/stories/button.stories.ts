import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Button' };
export default meta;

type Story = StoryObj;

const row = (attrs: string) => `
  <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 24px">
    <button class="ek-button" ${attrs}>Default</button>
    <button class="ek-button" ${attrs} data-shape="icon" aria-label="Confirm"><svg viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M229.7 77.7l-128 128a8 8 0 0 1-11.4 0l-56-56a8 8 0 0 1 11.4-11.4L96 188.7 218.3 66.3a8 8 0 0 1 11.4 11.4z"/></svg></button>
    <a class="ek-button" ${attrs} href="#">Link</a>
  </div>`;

export const Variants: Story = {
  render: () => ({
    template: ['', 'data-variant="primary"', 'data-variant="inverse"'].map(row).join(''),
  }),
};

export const Disabled: Story = {
  render: () => ({
    template: [
      row('disabled'),
      row('disabled data-variant="primary"'),
      row('disabled data-variant="inverse"'),
      row('aria-disabled="true"'),
    ].join(''),
  }),
};

export const Busy: Story = {
  render: () => ({
    template: `<div style="padding:24px"><button class="ek-button" data-variant="primary" aria-busy="true">Saving…</button></div>`,
  }),
};

export const Block: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:360px"><button class="ek-button" data-block>Full width</button></div>`,
  }),
};

export const Quiet: Story = {
  render: () => ({
    template: `<div data-quiet>${row('')}${row('data-variant="primary"')}</div>`,
  }),
};
