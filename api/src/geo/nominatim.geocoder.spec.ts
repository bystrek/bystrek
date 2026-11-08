import { describe, expect, it, mock } from 'bun:test';
import { GeocoderError, OsmType } from './geocoder';
import {
  NominatimGeocoder,
  type GeocoderFetch,
  type NominatimGeocoderOptions,
} from './nominatim.geocoder';

const BASE_URL = 'https://geo.example.test/nominatim/';

function place(id: number, name = `Place ${id}`) {
  return { osm_type: 'node', osm_id: id, display_name: name, lat: '50.06', lon: '19.94' };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

// A fake clock: sleep advances time instead of waiting.
function setup(
  responses: (() => Response | Promise<Response>)[],
  options: NominatimGeocoderOptions = {},
) {
  let time = 1_000_000;
  const sleeps: number[] = [];
  const fetchMock = mock<GeocoderFetch>(() => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return Promise.resolve(next());
  });
  const geocoder = new NominatimGeocoder({
    baseUrl: BASE_URL,
    userAgent: 'bystrek-test',
    fetch: fetchMock,
    now: () => time,
    sleep: (ms) => {
      sleeps.push(ms);
      time += ms;
      return Promise.resolve();
    },
    ...options,
  });
  return {
    geocoder,
    fetchMock,
    sleeps,
    advance: (ms: number) => (time += ms),
    url: (call: number) => new URL(String(fetchMock.mock.calls[call][0])),
  };
}

describe('NominatimGeocoder.search', () => {
  it('returns no candidates when nothing matches', async () => {
    const { geocoder } = setup([() => jsonResponse([])]);

    expect(await geocoder.search('Nowhere 1')).toEqual([]);
  });

  it('maps one result to a candidate and identifies the app', async () => {
    const { geocoder, fetchMock, url } = setup([
      () => jsonResponse([place(123, 'Café Camelot, Świętego Tomasza 17, Kraków')]),
    ]);

    const candidates = await geocoder.search('Świętego Tomasza 17, Kraków');

    expect(candidates).toEqual([
      {
        osmType: OsmType.Node,
        osmId: 123,
        displayAddress: 'Café Camelot, Świętego Tomasza 17, Kraków',
        lat: 50.06,
        lng: 19.94,
      },
    ]);
    const request = url(0);
    expect(request.origin + request.pathname).toBe('https://geo.example.test/nominatim/search');
    expect(request.searchParams.get('format')).toBe('jsonv2');
    expect(request.searchParams.get('limit')).toBe('3');
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toMatchObject({ 'User-Agent': 'bystrek-test' });
  });

  it('returns at most 3 candidates and drops malformed entries', async () => {
    const { geocoder } = setup([
      () =>
        jsonResponse([
          place(1),
          { ...place(2), osm_type: 'area' },
          { ...place(3), lat: 'north' },
          place(4),
          place(5),
          place(6),
        ]),
    ]);

    const candidates = await geocoder.search('Rynek');

    expect(candidates.map((c) => c.osmId)).toEqual([1, 4, 5]);
  });

  it('does not call the geocoder for a blank address', async () => {
    const { geocoder, fetchMock } = setup([]);

    expect(await geocoder.search('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an HTTP failure as a GeocoderError', async () => {
    const { geocoder } = setup([() => jsonResponse({}, { status: 503 })]);

    const result = geocoder.search('Rynek');
    await expect(result).rejects.toBeInstanceOf(GeocoderError);
    await expect(result).rejects.toThrow('Geocoder request failed with HTTP 503');
  });

  it('surfaces a network failure as a GeocoderError', async () => {
    const { geocoder } = setup([() => Promise.reject(new TypeError('fetch failed'))]);

    await expect(geocoder.search('Rynek')).rejects.toBeInstanceOf(GeocoderError);
  });

  it('surfaces an unreadable body as a GeocoderError', async () => {
    const { geocoder } = setup([
      () => new Response('<html>busy</html>', { status: 200 }),
      () => jsonResponse({ error: 'nope' }),
    ]);

    await expect(geocoder.search('Rynek')).rejects.toBeInstanceOf(GeocoderError);
    await expect(geocoder.search('Rynek')).rejects.toThrow('unexpected response');
  });

  it('does not cache a failure', async () => {
    const { geocoder, fetchMock } = setup([
      () => jsonResponse({}, { status: 500 }),
      () => jsonResponse([place(1)]),
    ]);

    await expect(geocoder.search('Rynek')).rejects.toBeInstanceOf(GeocoderError);
    expect(await geocoder.search('Rynek')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a repeated query from the cache, keyed on the normalised text', async () => {
    const { geocoder, fetchMock } = setup([() => jsonResponse([place(1)])]);

    const first = await geocoder.search('Rynek Główny 1, Kraków');
    const second = await geocoder.search('  rynek   GŁÓWNY 1,\tkraków ');

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cache entry expires', async () => {
    const { geocoder, fetchMock, advance } = setup(
      [() => jsonResponse([place(1)]), () => jsonResponse([place(2)])],
      { cacheTtlMs: 60_000 },
    );

    await geocoder.search('Rynek');
    advance(60_000);
    const candidates = await geocoder.search('Rynek');

    expect(candidates[0].osmId).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry beyond the cache size', async () => {
    const { geocoder, fetchMock, advance } = setup(
      [
        () => jsonResponse([place(1)]),
        () => jsonResponse([place(2)]),
        () => jsonResponse([place(3)]),
      ],
      { maxCacheEntries: 1 },
    );

    await geocoder.search('a');
    advance(1000);
    await geocoder.search('b');
    advance(1000);
    await geocoder.search('a');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throttles to one request per second, including concurrent callers', async () => {
    const { geocoder, fetchMock, sleeps, advance } = setup([
      () => jsonResponse([place(1)]),
      () => jsonResponse([place(2)]),
      () => jsonResponse([place(3)]),
      () => jsonResponse([place(4)]),
    ]);

    await geocoder.search('a');
    expect(sleeps).toEqual([]);

    advance(400);
    await geocoder.search('b');
    expect(sleeps).toEqual([600]);

    await Promise.all([geocoder.search('c'), geocoder.search('d')]);
    expect(sleeps).toEqual([600, 1000, 1000]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not throttle a cache hit', async () => {
    const { geocoder, sleeps } = setup([() => jsonResponse([place(1)])]);

    await geocoder.search('a');
    await geocoder.search('a');

    expect(sleeps).toEqual([]);
  });
});

describe('NominatimGeocoder.lookup', () => {
  it('looks up one OSM object by its prefixed id', async () => {
    const { geocoder, url } = setup([() => jsonResponse([{ ...place(42), osm_type: 'way' }])]);

    const candidate = await geocoder.lookup(OsmType.Way, 42);

    expect(candidate).toMatchObject({ osmType: OsmType.Way, osmId: 42 });
    const request = url(0);
    expect(request.pathname).toBe('/nominatim/lookup');
    expect(request.searchParams.get('osm_ids')).toBe('W42');
  });

  it('returns null when the object does not exist', async () => {
    const { geocoder } = setup([() => jsonResponse([])]);

    expect(await geocoder.lookup(OsmType.Relation, 7)).toBeNull();
  });

  it('surfaces a failure as a GeocoderError', async () => {
    const { geocoder } = setup([() => jsonResponse({}, { status: 429 })]);

    await expect(geocoder.lookup(OsmType.Node, 1)).rejects.toBeInstanceOf(GeocoderError);
  });

  it('answers a candidate from a recent search without another request', async () => {
    const { geocoder, fetchMock } = setup([() => jsonResponse([place(9)])]);

    const [found] = await geocoder.search('Rynek');
    const looked = await geocoder.lookup(OsmType.Node, 9);

    expect(looked).toEqual(found);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
