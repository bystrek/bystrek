import { describe, expect, it, mock } from 'bun:test';
import { GeocoderError, OsmType } from './geocoder';
import type { GetJson } from '../http/get-json';
import { NominatimGeocoder } from './nominatim.geocoder';

function result(id: number, name = `Place ${id}`) {
  return { osm_type: 'node', osm_id: id, display_name: name, lat: '50.06', lon: '19.94' };
}

function setup(answer: () => Promise<unknown>) {
  const get = mock<GetJson>(answer);
  const geocoder = new NominatimGeocoder(get, 'https://geo.example.test/nominatim/');
  return { geocoder, get, url: () => new URL(get.mock.calls[0][0]) };
}

describe('NominatimGeocoder.search', () => {
  it('returns nothing when nothing matches', async () => {
    const { geocoder } = setup(() => Promise.resolve([]));

    expect(await geocoder.search('Nowhere 1')).toEqual([]);
  });

  it('maps one result to a location', async () => {
    const { geocoder, url } = setup(() =>
      Promise.resolve([result(123, 'Café Camelot, Świętego Tomasza 17, Kraków')]),
    );

    expect(await geocoder.search('Świętego Tomasza 17, Kraków')).toEqual([
      {
        osmType: OsmType.Node,
        osmId: 123,
        displayAddress: 'Café Camelot, Świętego Tomasza 17, Kraków',
        lat: 50.06,
        lng: 19.94,
      },
    ]);
    expect(url().origin + url().pathname).toBe('https://geo.example.test/nominatim/search');
    expect(url().searchParams.get('format')).toBe('jsonv2');
    expect(url().searchParams.get('limit')).toBe('3');
  });

  it('returns at most 3 locations and drops malformed entries', async () => {
    const { geocoder } = setup(() =>
      Promise.resolve([
        result(1),
        { ...result(2), osm_type: 'area' },
        { ...result(3), lat: 'north' },
        { ...result(4), osm_id: '4' },
        { ...result(5), lat: '' },
        { ...result(6), lon: null },
        { ...result(7), lat: 50.06 },
        { ...result(8), lon: '200' },
        result(9),
        result(10),
        result(11),
      ]),
    );

    expect((await geocoder.search('Rynek')).map((l) => l.osmId)).toEqual([1, 9, 10]);
  });

  it('sends a normalised query, so spelling variants share a URL', async () => {
    const { geocoder, get } = setup(() => Promise.resolve([]));

    await geocoder.search('Rynek Główny 1, Kraków');
    await geocoder.search('  rynek   GŁÓWNY 1,\tkraków ');

    expect(get.mock.calls[1][0]).toBe(get.mock.calls[0][0]);
    expect(new URL(get.mock.calls[0][0]).searchParams.get('q')).toBe('rynek główny 1, kraków');
  });

  it('does not call the geocoder for a blank address', async () => {
    const { geocoder, get } = setup(() => Promise.resolve([]));

    expect(await geocoder.search('   ')).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('wraps a failed request in a GeocoderError', async () => {
    const cause = new Error('HTTP 503');
    const { geocoder } = setup(() => Promise.reject(cause));

    const error = await geocoder.search('Rynek').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GeocoderError);
    expect((error as GeocoderError).cause).toBe(cause);
  });

  it('rejects a body that is not an array', async () => {
    const { geocoder } = setup(() => Promise.resolve({ error: 'nope' }));

    await expect(geocoder.search('Rynek')).rejects.toThrow('unexpected response');
  });
});

describe('NominatimGeocoder.lookup', () => {
  it('looks up one OSM object by its prefixed id', async () => {
    const { geocoder, url } = setup(() => Promise.resolve([{ ...result(42), osm_type: 'way' }]));

    expect(await geocoder.lookup(OsmType.Way, 42)).toMatchObject({
      osmType: OsmType.Way,
      osmId: 42,
    });
    expect(url().pathname).toBe('/nominatim/lookup');
    expect(url().searchParams.get('osm_ids')).toBe('W42');
  });

  it('returns null when the object does not exist', async () => {
    const { geocoder } = setup(() => Promise.resolve([]));

    expect(await geocoder.lookup(OsmType.Relation, 7)).toBeNull();
  });

  it('ignores a result for a different object', async () => {
    const { geocoder } = setup(() => Promise.resolve([result(8)]));

    expect(await geocoder.lookup(OsmType.Node, 9)).toBeNull();
  });

  it('wraps a failed request in a GeocoderError', async () => {
    const { geocoder } = setup(() => Promise.reject(new Error('HTTP 429')));

    await expect(geocoder.lookup(OsmType.Node, 1)).rejects.toBeInstanceOf(GeocoderError);
  });
});
