import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EkAlert } from '@ekierka/angular';
import { AlertSlotsHarness } from './alert-slots.harness';

const meta: Meta<EkAlert> = {
  title: 'Ekierka/Alert',
  component: EkAlert,
  decorators: [moduleMetadata({ imports: [EkAlert, AlertSlotsHarness] })],
  args: { tone: 'neutral', heading: "Can't do that", dismissible: true },
  argTypes: { tone: { control: 'inline-radio', options: ['danger', 'primary', 'neutral'] } },
};
export default meta;

type Story = StoryObj<EkAlert>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="padding:24px;max-width:360px">
        <ek-alert [tone]="tone" [heading]="heading" [dismissible]="dismissible">I can only read your calendar for now.</ek-alert>
      </div>
    `,
  }),
};

// Spike: Angular adds, removes, reorders and rewrites the projected content. Everything should
// stay inside the box's body, in template order.
export const SlotsUnderAngular: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:420px"><app-alert-slots-harness /></div>`,
  }),
};
