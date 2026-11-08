import type { Meta, StoryObj } from '@storybook/angular-vite';
import { aPlace } from './place-fixtures';
import { PlaceRow, PlaceRowMode } from './place-row';

const meta: Meta<PlaceRow> = {
  title: 'Places/Place row',
  component: PlaceRow,
  args: { place: aPlace(), mode: PlaceRowMode.Idle },
  argTypes: {
    mode: { control: 'inline-radio', options: Object.values(PlaceRowMode) },
  },
  render: (args) => ({
    props: args,
    template: `<div style="padding:24px;max-width:560px"><app-place-row [place]="place" [mode]="mode" /></div>`,
  }),
};
export default meta;

type Story = StoryObj<PlaceRow>;

export const ToVisit: Story = {};

export const Visited: Story = {
  args: { place: aPlace({ visitedByMe: true }) },
};

export const WithNotesAndLink: Story = {
  args: {
    place: aPlace({
      notes: 'Great cheesecake.\nSit upstairs, it is quieter.',
      url: 'https://www.camelot.pl/menu',
    }),
  },
};

export const LongText: Story = {
  args: {
    place: aPlace({
      name: 'Muzeum Narodowe w Krakowie – Gmach Główny, Galeria Sztuki Polskiej XX i XXI wieku',
      category: 'museum',
      address: 'aleja 3 Maja 1, 30-062 Kraków, Małopolska, Polska',
      notes:
        'Free on Tuesdays. The Wyspiański room is worth the trip on its own; leave at least two hours.',
      url: 'https://mnk.pl/oddzialy/gmach-glowny/wystawy-stale/galeria-sztuki-polskiej-xx-wieku',
    }),
  },
};

export const ConfirmDelete: Story = {
  args: { mode: PlaceRowMode.ConfirmDelete },
};

export const Busy: Story = {
  args: { place: aPlace({ visitedByMe: true }), mode: PlaceRowMode.Busy },
};

export const PhoneWidth: Story = {
  args: { place: aPlace({ notes: 'Great cheesecake', url: 'https://www.camelot.pl/' }) },
  render: (args) => ({
    props: args,
    template: `<div style="padding:16px;width:328px"><app-place-row [place]="place" [mode]="mode" /></div>`,
  }),
};
