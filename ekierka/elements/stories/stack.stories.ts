import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Ekierka CSS/Stack' };
export default meta;

type Story = StoryObj;

const item = '<div class="ek-card" data-weight="thin">Item</div>';

export const Vertical: Story = {
  render: () => ({
    template: `<div class="ek-stack" data-gap="4" style="padding:24px;max-width:360px">${item.repeat(3)}</div>`,
  }),
};

export const Horizontal: Story = {
  render: () => ({
    template: `<div class="ek-stack" data-direction="horizontal" data-align="center" data-gap="2" style="padding:24px">${item.repeat(4)}</div>`,
  }),
};

export const Gaps: Story = {
  render: () => ({
    template: ['1', '2', '3', '4', '6']
      .map(
        (gap) =>
          `<div class="ek-stack" data-direction="horizontal" data-gap="${gap}" style="padding:12px 24px">${item.repeat(3)}</div>`,
      )
      .join(''),
  }),
};
