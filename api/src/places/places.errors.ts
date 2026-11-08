export class PlaceNotFoundError extends Error {
  constructor(id: string) {
    super(`Place ${id} not found`);
    this.name = 'PlaceNotFoundError';
  }
}

// Another place already sits at that OSM object.
export class DuplicatePlaceError extends Error {
  constructor() {
    super('That place is already on the list');
    this.name = 'DuplicatePlaceError';
  }
}

// The geocoder answered, but has no location for the address or OSM object.
export class LocationNotFoundError extends Error {
  constructor() {
    super("Couldn't find that address");
    this.name = 'LocationNotFoundError';
  }
}
