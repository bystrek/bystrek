import { GEOCODER_URL, GEOCODER_USER_AGENT } from '../env';
import { GeocoderError, OsmType, type GeocodeCandidate, type Geocoder } from './geocoder';

const MAX_CANDIDATES = 3;

interface NominatimPlace {
  osm_type?: unknown;
  osm_id?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

export type GeocoderFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface NominatimGeocoderOptions {
  baseUrl?: string;
  userAgent?: string;
  fetch?: GeocoderFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  // Nominatim's usage policy: at most 1 request per second.
  minIntervalMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  timeoutMs?: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

// A Nominatim-compatible API (https://nominatim.org/release-docs/latest/api/Overview/).
export class NominatimGeocoder implements Geocoder {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly fetch: GeocoderFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;

  private nextSlotAt = 0;
  // Short-lived, for refinements of the same prompt; not a store.
  private readonly searches = new Map<string, CacheEntry<GeocodeCandidate[]>>();
  private readonly lookups = new Map<string, CacheEntry<GeocodeCandidate | null>>();

  constructor(options: NominatimGeocoderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? GEOCODER_URL).replace(/\/+$/, '');
    this.userAgent = options.userAgent ?? GEOCODER_USER_AGENT;
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000;
    this.maxCacheEntries = options.maxCacheEntries ?? 500;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async search(address: string): Promise<GeocodeCandidate[]> {
    const key = normaliseQuery(address);
    if (!key) {
      return [];
    }
    const cached = this.cached(this.searches, key);
    if (cached) {
      return cached.value;
    }

    const params = new URLSearchParams({ q: key, format: 'jsonv2', limit: String(MAX_CANDIDATES) });
    const candidates = (await this.request(`/search?${params}`)).slice(0, MAX_CANDIDATES);
    this.store(this.searches, key, candidates);
    // A save right after a draft looks up one of these; answer it without another request.
    for (const candidate of candidates) {
      this.store(this.lookups, lookupKey(candidate.osmType, candidate.osmId), candidate);
    }
    return candidates;
  }

  async lookup(osmType: OsmType, osmId: number): Promise<GeocodeCandidate | null> {
    const key = lookupKey(osmType, osmId);
    const cached = this.cached(this.lookups, key);
    if (cached) {
      return cached.value;
    }

    const params = new URLSearchParams({ osm_ids: key, format: 'jsonv2' });
    const candidate =
      (await this.request(`/lookup?${params}`)).find(
        (c) => c.osmType === osmType && c.osmId === osmId,
      ) ?? null;
    this.store(this.lookups, key, candidate);
    return candidate;
  }

  private async request(path: string): Promise<GeocodeCandidate[]> {
    await this.takeSlot();
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new GeocoderError(`Geocoder request failed with HTTP ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof GeocoderError) {
        throw error;
      }
      throw new GeocoderError('Geocoder request failed', { cause: error });
    }
    if (!Array.isArray(body)) {
      throw new GeocoderError('Geocoder returned an unexpected response');
    }
    return body.flatMap((place: NominatimPlace) => {
      const candidate = toCandidate(place);
      return candidate ? [candidate] : [];
    });
  }

  // Reserves the next free slot synchronously, so concurrent callers queue up instead of
  // all seeing the same "last request" time.
  private async takeSlot(): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = at + this.minIntervalMs;
    if (at > now) {
      await this.sleep(at - now);
    }
  }

  private cached<T>(cache: Map<string, CacheEntry<T>>, key: string): CacheEntry<T> | undefined {
    const entry = cache.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry;
  }

  private store<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.delete(key);
    cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, value });
    // Maps iterate in insertion order: the first key is the oldest.
    while (cache.size > this.maxCacheEntries) {
      cache.delete(cache.keys().next().value!);
    }
  }
}

// Case, spacing and Unicode form don't change what Nominatim finds.
function normaliseQuery(address: string): string {
  return address.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Nominatim's /lookup id form: N123, W123, R123.
function lookupKey(osmType: OsmType, osmId: number): string {
  return `${osmType[0].toUpperCase()}${osmId}`;
}

const OSM_TYPES = new Set<unknown>(Object.values(OsmType));

function isOsmType(value: unknown): value is OsmType {
  return OSM_TYPES.has(value);
}

function toCandidate(place: NominatimPlace): GeocodeCandidate | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (
    !isOsmType(place.osm_type) ||
    typeof place.osm_id !== 'number' ||
    !Number.isSafeInteger(place.osm_id) ||
    typeof place.display_name !== 'string' ||
    typeof place.lat !== 'string' ||
    typeof place.lon !== 'string' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return {
    osmType: place.osm_type,
    osmId: place.osm_id,
    displayAddress: place.display_name,
    lat,
    lng,
  };
}
