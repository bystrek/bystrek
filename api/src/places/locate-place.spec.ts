import { describe, expect, it, mock } from 'bun:test';
import { GeocoderError, OsmType, type GeocodedLocation, type Geocoder } from '../geo/geocoder';
import { locateAddress, locateOsmObject } from './locate-place';
import { LocationNotFoundError } from './places.errors';

function location(osmId: number): GeocodedLocation {
  return { osmType: OsmType.Node, osmId, displayAddress: `Place ${osmId}`, lat: 50, lng: 19 };
}

function geocoder(answer: Partial<Geocoder>): Geocoder {
  return {
    search: mock(() => Promise.resolve([])),
    lookup: mock(() => Promise.resolve(null)),
    ...answer,
  };
}

describe('locateOsmObject', () => {
  it('returns the looked-up location', async () => {
    const found = geocoder({ lookup: () => Promise.resolve(location(1)) });

    expect(await locateOsmObject(found, OsmType.Node, 1)).toEqual(location(1));
  });

  it('throws when the object does not exist', async () => {
    await expect(locateOsmObject(geocoder({}), OsmType.Node, 1)).rejects.toBeInstanceOf(
      LocationNotFoundError,
    );
  });

  it('passes a geocoder failure through', async () => {
    const down = geocoder({ lookup: () => Promise.reject(new GeocoderError('down')) });

    await expect(locateOsmObject(down, OsmType.Node, 1)).rejects.toBeInstanceOf(GeocoderError);
  });
});

describe('locateAddress', () => {
  it('returns the best match', async () => {
    const found = geocoder({ search: () => Promise.resolve([location(1), location(2)]) });

    expect(await locateAddress(found, 'Rynek 1')).toEqual(location(1));
  });

  it('throws when nothing matches', async () => {
    await expect(locateAddress(geocoder({}), 'Nowhere')).rejects.toBeInstanceOf(
      LocationNotFoundError,
    );
  });
});
