import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Card } from './card';

const meta: Meta<Card> = {
  title: 'Primitives/Card',
  component: Card,
  args: { tone: 'surface', weight: 'heavy' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['surface', 'primary', 'danger'] },
    weight: { control: 'inline-radio', options: ['heavy', 'thin'] },
  },
};
export default meta;

type Story = StoryObj<Card>;

export const Playground: Story = {
  render: (args) => ({
    props: args,
    template: `<div style="padding:24px;max-width:360px"><app-card [tone]="tone" [weight]="weight">Thu 22 Oct, 4 events</app-card></div>`,
  }),
};

export const TonesAndWeights: Story = {
  render: () => ({
    props: { tones: ['surface', 'primary', 'danger'], weights: ['heavy', 'thin'] },
    template: `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,280px));gap:24px;padding:24px">
        @for (t of tones; track t) {
          @for (w of weights; track w) {
            <app-card [tone]="t" [weight]="w">
              <strong>{{ t }} / {{ w }}</strong>
              <p style="margin:8px 0 0;font:500 14px var(--font-mono)">09:30 Dentist</p>
            </app-card>
          }
        }
      </div>
    `,
  }),
};

export const Quiet: Story = {
  render: () => ({
    template: `
      <div data-quiet style="padding:24px;max-width:360px">
        <app-card>Heavy card with elevation removed by [data-quiet]</app-card>
      </div>
    `,
  }),
};
