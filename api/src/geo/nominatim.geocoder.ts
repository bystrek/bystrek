import { z } from 'zod';
import { GeocoderError, OsmType, type GeocodedLocation, type Geocoder } from './geocoder';
import type { GetJson } from '../http/get-json';

const MAX_RESULTS = 3;

// One entry of a jsonv2 /search or /lookup response, mapped to our type.
const NominatimResult = z
  .object({
    osm_type: z.enum(OsmType),
    osm_id: z.number().int(),
    display_name: z.string(),
    // jsonv2 sends coordinates as numeric strings. Coerce only a non-empty string, so a missing
    // or empty value can't become 0.
    lat: z.string().trim().min(1).pipe(z.coerce.number<string>().min(-90).max(90)),
    lon: z.string().trim().min(1).pipe(z.coerce.number<string>().min(-180).max(180)),
  })
  .transform((r): GeocodedLocation => ({
    osmType: r.osm_type,
    osmId: r.osm_id,
    displayAddress: r.display_name,
    lat: r.lat,
    lng: r.lon,
  }));

// A Nominatim-compatible API (https://nominatim.org/release-docs/latest/api/Overview/).
export class NominatimGeocoder implements Geocoder {
  private readonly baseUrl: string;

  constructor(
    private readonly get: GetJson,
    baseUrl: string,
  ) {
    // Appended, not resolved: the base URL may carry a path (e.g. a self-hosted /nominatim).
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async search(address: string): Promise<GeocodedLocation[]> {
    // Normalised so that spelling variants build the same URL, and so hit the same cache entry.
    const q = address.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!q) {
      return [];
    }
    const results = await this.request('search', { q, limit: String(MAX_RESULTS) });
    return results.slice(0, MAX_RESULTS);
  }

  async lookup(osmType: OsmType, osmId: number): Promise<GeocodedLocation | null> {
    // Nominatim's id form: N123, W123, R123.
    const results = await this.request('lookup', {
      osm_ids: `${osmType[0].toUpperCase()}${osmId}`,
    });
    return results.find((r) => r.osmType === osmType && r.osmId === osmId) ?? null;
  }

  // Every failure becomes a GeocoderError; only a real empty array means "not found".
  private async request(
    endpoint: 'search' | 'lookup',
    params: Record<string, string>,
  ): Promise<GeocodedLocation[]> {
    const url = `${this.baseUrl}/${endpoint}?${new URLSearchParams({ ...params, format: 'jsonv2' })}`;
    let body: unknown;
    try {
      body = await this.get(url);
    } catch (error) {
      throw new GeocoderError('Geocoder request failed', { cause: error });
    }
    if (!Array.isArray(body)) {
      throw new GeocoderError('Geocoder returned an unexpected response');
    }
    // A malformed entry is dropped, not fatal: it shouldn't hide the valid ones.
    return body.flatMap((item) => {
      const result = NominatimResult.safeParse(item);
      return result.success ? [result.data] : [];
    });
  }
}
