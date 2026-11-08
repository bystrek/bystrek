import type { GeocodedLocation, Geocoder, OsmType } from '../geo/geocoder';
import { LocationNotFoundError } from './places.errors';

// The two ways a place gets its location. Both throw instead of returning nothing: a place
// is never saved without one. A GeocoderError (geocoder unreachable) passes through.

// The OSM object the user confirmed from a draft.
export async function locateOsmObject(
  geocoder: Geocoder,
  osmType: OsmType,
  osmId: number,
): Promise<GeocodedLocation> {
  const location = await geocoder.lookup(osmType, osmId);
  if (!location) throw new LocationNotFoundError();
  return location;
}

// The best match for an edited address; there's no picker in the edit form.
export async function locateAddress(
  geocoder: Geocoder,
  address: string,
): Promise<GeocodedLocation> {
  const [best] = await geocoder.search(address);
  if (!best) throw new LocationNotFoundError();
  return best;
}
