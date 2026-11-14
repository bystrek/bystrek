import { moduleMetadata } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { EklDialogComponent } from '@ekierka/lit-angular';
import { LitDialogHarness } from './dialog.harness';

const meta: Meta<EklDialogComponent> = {
  title: 'Ekierka (Lit)/Dialog',
  component: EklDialogComponent,
  decorators: [moduleMetadata({ imports: [EklDialogComponent, LitDialogHarness] })],
};
export default meta;

type Story = StoryObj<EklDialogComponent>;

// Spike: behaviour-only dialog. Angular projects (and keeps changing) the content; the element
// wires Zag's parts onto it, so labels resolve in one DOM tree. Includes a signal form.
export const RenameDialog: Story = {
  render: () => ({ template: `<div style="padding:24px"><app-lit-dialog-harness /></div>` }),
};
