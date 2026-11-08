import { describe, expect, it, mock } from 'bun:test';
import { GeocoderError, OsmType, type GeocodedLocation, type Geocoder } from '../geo/geocoder';
import { LlmError, type LlmClient, type LlmJsonRequest } from '../llm/llm.client';
import { PlaceCategory } from './place-category';
import type { PlaceDraft } from './places-draft.parse';
import { SYSTEM_PROMPT } from './places-draft.prompt';
import { MissingItem, PlacesDraftService } from './places-draft.service';
import type { Place, PlacesService } from './places.service';

const CAMELOT: GeocodedLocation = {
  osmType: OsmType.Node,
  osmId: 1,
  displayAddress: 'Café Camelot, Świętego Tomasza 17, Kraków',
  lat: 50.06,
  lng: 19.94,
};
const OTHER_CAMELOT: GeocodedLocation = { ...CAMELOT, osmId: 2, displayAddress: 'Camelot, Łódź' };

const draft = {
  name: 'Café Camelot',
  category: PlaceCategory.Cafe,
  address: 'Świętego Tomasza 17, Kraków',
  notes: 'great cheesecake',
  url: null,
} satisfies PlaceDraft;
const reply = (fields: object = {}) => JSON.stringify({ kind: 'place', ...draft, ...fields });

const existing = { id: 'place-1', name: 'Café Camelot', createdBy: { id: 'u2', name: 'Ana' } };

function setUp(
  content: string | Error,
  { search = [CAMELOT], saved }: { search?: GeocodedLocation[] | Error; saved?: object } = {},
) {
  const generateJson = mock((_: LlmJsonRequest) =>
    content instanceof Error ? Promise.reject(content) : Promise.resolve(content),
  );
  const geocoder: Geocoder = {
    search: mock(() =>
      search instanceof Error ? Promise.reject(search) : Promise.resolve(search),
    ),
    lookup: mock(() => Promise.resolve(null)),
  };
  const findByOsm = mock(() => Promise.resolve(saved as Place | undefined));
  const service = new PlacesDraftService({ generateJson } as LlmClient, geocoder, {
    findByOsm,
  } as unknown as PlacesService);
  return {
    draft: (text = 'a place') => service.draft('u1', text),
    generateJson,
    geocoder,
    findByOsm,
  };
}

describe('PlacesDraftService', () => {
  it('is ready with one geocoded match that is not on the list', async () => {
    const { draft: run, findByOsm } = setUp(reply());

    expect(await run()).toEqual({ kind: 'ready', draft, location: CAMELOT });
    expect(findByOsm).toHaveBeenCalledWith('u1', OsmType.Node, 1);
  });

  it('asks for the missing name and address without geocoding', async () => {
    const { draft: run, geocoder } = setUp(reply({ name: null, address: null }));

    expect(await run()).toEqual({
      kind: 'needs_input',
      draft: { ...draft, name: null, address: null },
      missing: [MissingItem.Name, MissingItem.Address],
    });
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it('asks for a different address when the geocoder has none', async () => {
    const { draft: run } = setUp(reply(), { search: [] });

    expect(await run()).toEqual({
      kind: 'needs_input',
      draft,
      missing: [MissingItem.AddressNotFound],
    });
  });

  it('offers the candidates when the geocoder finds several', async () => {
    const { draft: run, findByOsm } = setUp(reply(), { search: [CAMELOT, OTHER_CAMELOT] });

    expect(await run()).toEqual({
      kind: 'needs_choice',
      draft,
      candidates: [CAMELOT, OTHER_CAMELOT],
    });
    expect(findByOsm).not.toHaveBeenCalled();
  });

  it('reports a match that is already on the list, with who added it', async () => {
    const { draft: run } = setUp(reply(), { saved: existing });

    expect(await run()).toEqual({ kind: 'duplicate', draft, place: existing as Place });
  });

  it('answers non-add requests with cant_do without geocoding', async () => {
    const { draft: run, geocoder } = setUp('{"kind":"cant_do"}');

    expect(await run()).toEqual({ kind: 'cant_do', text: 'I can only add places.' });
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it('falls back to text on a malformed reply without geocoding', async () => {
    const { draft: run, geocoder } = setUp('Café Camelot is in Kraków');

    expect(await run()).toEqual({
      kind: 'text',
      text: "I couldn't work that out. Try rephrasing it.",
    });
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it('sends the static system prompt and only the current text', async () => {
    const { draft: run, generateJson } = setUp(reply());

    await run('Camelot');
    await run('Camelot, Świętego Tomasza 17, Kraków');

    const requests = generateJson.mock.calls.map(([request]) => request);
    expect(requests.map((r) => r.system)).toEqual([SYSTEM_PROMPT, SYSTEM_PROMPT]);
    expect(requests.map((r) => r.user)).toEqual([
      'M: Camelot',
      'M: Camelot, Świętego Tomasza 17, Kraków',
    ]);
  });

  it('passes model and geocoder failures through for the filter to map', async () => {
    await expect(setUp(new LlmError('down')).draft()).rejects.toBeInstanceOf(LlmError);
    await expect(
      setUp(reply(), { search: new GeocoderError('down') }).draft(),
    ).rejects.toBeInstanceOf(GeocoderError);
  });
});
