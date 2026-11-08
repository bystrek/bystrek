import { OsmType, Place, PlaceCategory } from '../../core/places/places.service';

// Sample places for tests and stories.
export const aPlace = (overrides: Partial<Place> = {}): Place => ({
  id: 'p1',
  name: 'Café Camelot',
  category: PlaceCategory.Cafe,
  address: 'Świętego Tomasza 17, Kraków',
  displayAddress: 'Camelot, 17, Świętego Tomasza, Stare Miasto, Kraków, 31-022, Polska',
  lat: 50.0624,
  lng: 19.9394,
  osmType: OsmType.Node,
  osmId: 2412345678,
  notes: null,
  url: null,
  createdBy: { id: 'u1', name: 'Michał' },
  createdAt: '2026-11-08T12:00:00.000Z',
  updatedAt: '2026-11-08T12:00:00.000Z',
  visitedByMe: false,
  ...overrides,
});
