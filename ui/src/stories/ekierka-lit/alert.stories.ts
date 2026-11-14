import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EklAlertComponent } from '@ekierka/lit-angular';
import { LitAlertSlotsHarness } from './alert-slots.harness';

const meta: Meta<EklAlertComponent> = {
  title: 'Ekierka (Lit)/Alert',
  component: EklAlertComponent,
  decorators: [moduleMetadata({ imports: [EklAlertComponent, LitAlertSlotsHarness] })],
};
export default meta;

type Story = StoryObj<EklAlertComponent>;

export const Tones: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:24px;padding:24px;max-width:360px">
        <ekl-alert tone="danger" heading="Can't do that">I can only read your calendar for now.</ekl-alert>
        <ekl-alert tone="primary" heading="Saved">Your calendar link is connected.</ekl-alert>
        <ekl-alert tone="neutral" heading="Heads up" [dismissible]="false">Events refresh every few minutes.</ekl-alert>
      </div>
    `,
  }),
};

// Spike: Angular adds, removes, reorders and rewrites the projected content of a native slot.
export const SlotsUnderAngular: Story = {
  render: () => ({
    template: `<div style="padding:24px;max-width:420px"><app-lit-alert-slots-harness /></div>`,
  }),
};
