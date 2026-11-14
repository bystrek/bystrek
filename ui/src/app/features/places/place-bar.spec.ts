import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  GeocodedLocation,
  MissingItem,
  PlaceDraftResponse,
  PlaceDraftService,
} from '../../core/places/place-draft.service';
import {
  NewPlace,
  OsmType,
  Place,
  PlaceCategory,
  PlacesService,
} from '../../core/places/places.service';
import { aPlace } from './place-fixtures';
import { Places } from './places';

const PROMPT = 'Café Camelot, Świętego Tomasza 17, Kraków. Great cheesecake';

const draft = {
  name: 'Café Camelot',
  category: PlaceCategory.Cafe,
  address: 'Świętego Tomasza 17, Kraków',
  notes: 'Great cheesecake',
  url: null,
};
const location = (osmId: number, displayAddress: string): GeocodedLocation => ({
  osmType: OsmType.Node,
  osmId,
  displayAddress,
  lat: 50.06,
  lng: 19.94,
});
const camelotHere = location(1, 'Camelot, 17, Świętego Tomasza, Kraków');
const camelotThere = location(2, 'Camelot, Długa, Kraków');

const existing = aPlace({ id: 'manufaktura', name: 'Manufaktura' });

type DraftFn = (text: string) => Observable<PlaceDraftResponse>;

const render = async (
  drafts: DraftFn,
  places: Partial<Record<keyof PlacesService, unknown>> = {},
) => {
  const draftApi = { draft: vi.fn(drafts) };
  const placesApi = {
    list: vi.fn(async (): Promise<Place[]> => [existing]),
    create: vi.fn(async (p: NewPlace): Promise<Place> => aPlace({ ...p, id: 'new' })),
    update: vi.fn(),
    remove: vi.fn(),
    setVisited: vi.fn(async () => undefined),
    ...places,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PlaceDraftService, useValue: draftApi },
      { provide: PlacesService, useValue: placesApi },
    ],
  });
  const fixture = TestBed.createComponent(Places);
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  // Lets a mocked API promise resolved by the test finish before checking the page.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  const field = () => el.querySelector<HTMLInputElement>('app-place-bar input.field')!;
  const type = async (text: string) => {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await settle();
  };
  const send = async () => {
    button('Draft place').click();
    await settle();
  };
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
    )!;
  const click = async (label: string) => {
    button(label).click();
    await settle();
  };
  const names = () =>
    [...el.querySelectorAll('app-place-row .name')].map((n) => n.textContent?.trim());
  return { el, draftApi, placesApi, field, type, send, button, click, names, settle };
};

describe('PlaceBar', () => {
  it('keeps the prompt and lists what is missing, then sends the edited full text', async () => {
    const ui = await render((text) =>
      of<PlaceDraftResponse>(
        text.includes('Kraków')
          ? { kind: 'ready', draft, location: camelotHere }
          : {
              kind: 'needs_input',
              draft: { ...draft, address: null },
              missing: [MissingItem.Address],
            },
      ),
    );

    await ui.type('Café Camelot');
    await ui.send();
    expect(ui.field().value).toBe('Café Camelot');
    expect(ui.field().disabled).toBe(false);
    expect(ui.el.querySelector('.missing')?.textContent).toContain('Its address');

    await ui.type('Café Camelot, Świętego Tomasza 17, Kraków');
    await ui.send();
    expect(ui.draftApi.draft).toHaveBeenLastCalledWith('Café Camelot, Świętego Tomasza 17, Kraków');
    expect(ui.el.querySelector('.missing')).toBeNull();
    expect(ui.el.textContent).toContain('Preview');
  });

  it('saves the preview, clears the input and puts the place at the top of the list', async () => {
    const ui = await render(() => of({ kind: 'ready', draft, location: camelotHere }));

    await ui.type(PROMPT);
    await ui.send();
    expect(ui.el.textContent).toContain('Found as: Camelot, 17, Świętego Tomasza, Kraków');
    expect(ui.el.querySelector('app-place-bar app-osm-attribution')?.textContent).toContain(
      'OpenStreetMap',
    );
    expect(ui.field().value).toBe(PROMPT);

    await ui.click('Save');
    expect(ui.placesApi.create).toHaveBeenCalledWith({
      ...draft,
      osmType: OsmType.Node,
      osmId: 1,
    });
    expect(ui.field().value).toBe('');
    expect(ui.el.textContent).not.toContain('Preview');
    expect(ui.names()).toEqual(['Café Camelot', 'Manufaktura']);
  });

  it('keeps the prompt and shows why when the save fails', async () => {
    const ui = await render(() => of({ kind: 'ready', draft, location: camelotHere }), {
      create: vi.fn(async () => {
        throw new Error('That place is already on the list');
      }),
    });

    await ui.type(PROMPT);
    await ui.send();
    await ui.click('Save');

    expect(ui.el.querySelector('.save-error')?.textContent).toBe(
      'That place is already on the list',
    );
    expect(ui.field().value).toBe(PROMPT);
    expect(ui.names()).toEqual(['Manufaktura']);
  });

  it('clears the input only on an explicit cancel, not when a result is closed', async () => {
    const ui = await render(() => of({ kind: 'cant_do', text: 'I can only add places.' }));

    await ui.type('delete Manufaktura');
    await ui.send();
    expect(ui.el.textContent).toContain('I can only add places.');

    await ui.click('Close');
    expect(ui.el.textContent).not.toContain('I can only add places.');
    expect(ui.field().value).toBe('delete Manufaktura');

    await ui.click('Clear');
    expect(ui.field().value).toBe('');
  });

  it('previews the candidate the user picks and saves its location', async () => {
    const ui = await render(() =>
      of({ kind: 'needs_choice', draft, candidates: [camelotHere, camelotThere] }),
    );

    await ui.type(PROMPT);
    await ui.send();
    await ui.click('Camelot, Długa, Kraków');
    expect(ui.draftApi.draft).toHaveBeenCalledTimes(1);
    expect(ui.el.textContent).toContain('Found as: Camelot, Długa, Kraków');

    await ui.click('Save');
    expect(ui.placesApi.create).toHaveBeenCalledWith(expect.objectContaining({ osmId: 2 }));
  });

  it('offers to mark a duplicate visited', async () => {
    const ui = await render(() => of({ kind: 'duplicate', draft, place: existing }));

    await ui.type('Manufaktura, Drewnowska 58, Łódź');
    await ui.send();
    expect(ui.el.textContent).toContain('Already on the list');

    await ui.click('Mark visited');
    expect(ui.placesApi.setVisited).toHaveBeenCalledWith('manufaktura', true);
    expect(
      ui.el.querySelector('app-place-bar .ek-tag:has(app-icon[name="check"])')?.textContent,
    ).toContain('Visited');
    expect(ui.el.querySelector('app-place-row')?.hasAttribute('data-visited')).toBe(true);
  });

  it("shows the API's message when the draft fails", async () => {
    const ui = await render(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { message: "Couldn't reach the geocoder. Try again later." },
          }),
      ),
    );

    await ui.type(PROMPT);
    await ui.send();

    expect(ui.el.textContent).toContain("Couldn't reach the geocoder. Try again later.");
    expect(ui.field().value).toBe(PROMPT);
  });

  it('drops the in-flight draft when stopped', async () => {
    const pending = new Subject<PlaceDraftResponse>();
    const ui = await render(() => pending.asObservable());

    await ui.type(PROMPT);
    await ui.send();
    expect(ui.field().disabled).toBe(true);
    await ui.click('Stop');

    expect(pending.observed).toBe(false);
    expect(ui.field().value).toBe(PROMPT);
    expect(ui.field().disabled).toBe(false);
  });

  it('locks the bar while a save is in flight, so it cannot clear a newer prompt', async () => {
    let finish!: (place: Place) => void;
    const ui = await render(() => of({ kind: 'ready', draft, location: camelotHere }), {
      create: vi.fn(() => new Promise<Place>((resolve) => (finish = resolve))),
    });

    await ui.type(PROMPT);
    await ui.send();
    await ui.click('Save');
    expect(ui.field().disabled).toBe(true);
    expect(ui.button('Draft place').disabled).toBe(true);

    finish(aPlace({ id: 'new' }));
    await ui.settle();
    expect(ui.field().disabled).toBe(false);
    expect(ui.field().value).toBe('');
  });

  it('waits for the list to load before saving, so the load cannot drop the new place', async () => {
    let loaded!: (places: Place[]) => void;
    const ui = await render(() => of({ kind: 'ready', draft, location: camelotHere }), {
      list: vi.fn(() => new Promise<Place[]>((resolve) => (loaded = resolve))),
    });

    await ui.type(PROMPT);
    await ui.send();
    expect(ui.button('Save').disabled).toBe(true);

    loaded([existing]);
    await ui.settle();
    await ui.click('Save');
    expect(ui.names()).toEqual(['Café Camelot', 'Manufaktura']);
  });
});
