import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Alert } from './alert';

const meta: Meta<Alert> = {
  title: 'Primitives/Alert',
  component: Alert,
  args: { tone: 'neutral', heading: "Can't do that", dismissible: true },
  argTypes: { tone: { control: 'inline-radio', options: ['danger', 'primary', 'neutral'] } },
};
export default meta;

type Story = StoryObj<Alert>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="padding:24px;max-width:360px">
        <app-alert [tone]="tone" [heading]="heading" [dismissible]="dismissible">I can only read your calendar for now.</app-alert>
      </div>
    `,
  }),
};

export const Tones: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:24px;padding:24px;max-width:360px">
        <app-alert tone="danger" heading="Can't do that">I can only read your calendar for now.</app-alert>
        <app-alert tone="primary" heading="Saved">Your calendar link is connected.</app-alert>
        <app-alert tone="neutral" heading="Heads up">Events refresh every few minutes.</app-alert>
      </div>
    `,
  }),
};

export const NotDismissible: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:360px"><app-alert tone="danger" heading="Offline" [dismissible]="false" /></div>`,
  }),
};
