export const OsmType = {
  Node: 'node',
  Way: 'way',
  Relation: 'relation',
} as const;
export type OsmType = (typeof OsmType)[keyof typeof OsmType];

export interface GeocodedLocation {
  osmType: OsmType;
  osmId: number;
  displayAddress: string;
  lat: number;
  lng: number;
}

// Geocoded addresses and coordinates come from OpenStreetMap (ODbL). Wherever the UI shows
// them it must credit "© OpenStreetMap contributors", linking to
// https://www.openstreetmap.org/copyright.
export interface Geocoder {
  // Up to 3 locations, best first. An empty array means the address wasn't found.
  search(address: string): Promise<GeocodedLocation[]>;
  // The location of one OSM object, or null when it doesn't exist (anymore).
  lookup(osmType: OsmType, osmId: number): Promise<GeocodedLocation | null>;
}

// The geocoder couldn't answer (network, timeout, HTTP error, unreadable body). Distinct from
// "not found", so callers can block a save instead of treating the place as unlocatable.
export class GeocoderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeocoderError';
  }
}

export const GEOCODER = Symbol('GEOCODER');
