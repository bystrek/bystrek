import { Component, input, output } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { PlaceDraftService } from '../../core/places/place-draft.service';
import { Place, PlacesService } from '../../core/places/places.service';
import { aPlace } from './place-fixtures';
import { Places } from './places';
import { PlacesMap } from './places-map';

// jsdom has no WebGL: the page is tested against a stand-in with the map's inputs and output.
@Component({
  selector: 'app-places-map',
  template: `@for (place of places(); track place.id) {
    <button type="button" class="pin" (click)="selected.emit(place.id)">{{ place.name }}</button>
  }`,
})
class FakeMap {
  readonly places = input.required<readonly Place[]>();
  readonly selectedId = input<string | null>(null);
  readonly selected = output<string | null>();
}

const camelot = aPlace({
  id: 'camelot',
  notes: 'Great cheesecake',
  url: 'https://www.camelot.pl/',
});
const manufaktura = aPlace({
  id: 'manufaktura',
  name: 'Manufaktura',
  address: 'Drewnowska 58, Łódź',
  displayAddress: 'Manufaktura, Drewnowska, Łódź',
  visitedByMe: true,
});

const render = async (service: Partial<Record<keyof PlacesService, unknown>> = {}) => {
  const api = {
    list: vi.fn(async (): Promise<Place[]> => [camelot, manufaktura]),
    update: vi.fn(),
    remove: vi.fn(async () => undefined),
    setVisited: vi.fn(async () => undefined),
    ...service,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PlacesService, useValue: api },
      { provide: PlaceDraftService, useValue: {} },
    ],
  });
  TestBed.overrideComponent(Places, {
    remove: { imports: [PlacesMap] },
    add: { imports: [FakeMap] },
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(Places);
  await fixture.whenStable();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
};

const names = (el: HTMLElement) =>
  [...el.querySelectorAll('app-place-row .name')].map((n) => n.textContent?.trim());

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )!;

const settle = (fixture: ComponentFixture<Places>) => fixture.whenStable();

describe('Places', () => {
  it('lists every place with the OSM attribution', async () => {
    const { el } = await render();
    expect(names(el)).toEqual(['Café Camelot', 'Manufaktura']);
    expect(el.querySelector('.address')?.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/node/2412345678',
    );
    expect(el.querySelector('.website')?.textContent).toBe('camelot.pl');
    const attribution = el.querySelector<HTMLAnchorElement>('.attribution a');
    expect(attribution?.href).toBe('https://www.openstreetmap.org/copyright');
    expect(el.querySelector('.attribution')?.textContent).toContain('© OpenStreetMap contributors');
  });

  it('filters as you type, ignoring diacritics', async () => {
    const { fixture, el } = await render();
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;

    search.value = 'lodz';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(names(el)).toEqual(['Manufaktura']);

    search.value = 'pizza';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(el.textContent).toContain('No places match.');
  });

  it('shows only visited places under the Visited filter', async () => {
    const { fixture, el } = await render();
    button(el, 'Visited').click();
    await settle(fixture);
    expect(names(el)).toEqual(['Manufaktura']);
    expect(button(el, 'Visited').getAttribute('aria-pressed')).toBe('true');
  });

  it('marks a place visited', async () => {
    const { fixture, el, api } = await render();
    const toggle = el.querySelector<HTMLButtonElement>('app-place-row .visited')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    await settle(fixture);
    expect(api.setVisited).toHaveBeenCalledWith('camelot', true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('asks before deleting', async () => {
    const { fixture, el, api } = await render();

    button(el, 'Delete Café Camelot').click();
    await settle(fixture);
    expect(el.textContent).toContain('Delete for everyone?');
    button(el, 'Keep').click();
    await settle(fixture);
    expect(el.textContent).not.toContain('Delete for everyone?');

    button(el, 'Delete Café Camelot').click();
    await settle(fixture);
    button(el, 'Delete').click();
    await settle(fixture);
    expect(api.remove).toHaveBeenCalledWith('camelot');
    expect(names(el)).toEqual(['Manufaktura']);
  });

  it('edits a place in place and shows the saved version', async () => {
    const update = vi.fn(async (_id: string, patch: Partial<Place>) => ({ ...camelot, ...patch }));
    const { fixture, el } = await render({ update });

    button(el, 'Edit Café Camelot').click();
    await settle(fixture);
    const form = el.querySelector('app-place-form')!;
    expect(form.textContent).toContain('Found as: Camelot, 17, Świętego Tomasza');
    expect(form.textContent).toContain('© OpenStreetMap contributors');

    const name = form.querySelector<HTMLInputElement>('input[type="text"]')!;
    name.value = 'Camelot';
    name.dispatchEvent(new Event('input'));
    form.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);

    expect(update).toHaveBeenCalledWith('camelot', {
      name: 'Camelot',
      category: 'cafe',
      address: camelot.address,
      notes: 'Great cheesecake',
      url: 'https://www.camelot.pl/',
    });
    expect(el.querySelector('app-place-form')).toBeNull();
    expect(names(el)).toEqual(['Camelot', 'Manufaktura']);
  });

  it('keeps the form open with the API’s message when the address is not found', async () => {
    const update = vi.fn().mockRejectedValue(new Error("Couldn't find that address"));
    const { fixture, el } = await render({ update });

    button(el, 'Edit Café Camelot').click();
    await settle(fixture);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);

    expect(el.querySelector('app-place-form [role="alert"]')?.textContent).toContain(
      "Couldn't find that address",
    );
  });

  it('does not save without a name', async () => {
    const update = vi.fn();
    const { fixture, el } = await render({ update });

    button(el, 'Edit Café Camelot').click();
    await settle(fixture);
    const name = el.querySelector<HTMLInputElement>('app-place-form input[type="text"]')!;
    name.value = '';
    name.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);

    expect(update).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Enter a name.');
  });

  it('offers a retry when the list fails to load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([camelot]);
    const { fixture, el } = await render({ list });
    expect(el.textContent).toContain('offline');

    button(el, 'Try again').click();
    await settle(fixture);
    expect(names(el)).toEqual(['Café Camelot']);
  });

  describe('map view', () => {
    const pins = (el: HTMLElement) =>
      [...el.querySelectorAll('app-places-map .pin')].map((p) => p.textContent?.trim());

    const openMap = async () => {
      const rendered = await render();
      button(rendered.el, 'Map').click();
      await settle(rendered.fixture);
      const [map] = await rendered.fixture.getDeferBlocks();
      await map.render(DeferBlockState.Complete);
      return rendered;
    };

    it('shows a pin per place instead of the list', async () => {
      const { el } = await openMap();
      expect(pins(el)).toEqual(['Café Camelot', 'Manufaktura']);
      expect(el.querySelector('.list')).toBeNull();
      expect(el.querySelector('app-place-row')).toBeNull();
    });

    it('filters the pins with the search', async () => {
      const { fixture, el } = await openMap();
      const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      search.value = 'lodz';
      search.dispatchEvent(new Event('input'));
      await settle(fixture);
      expect(pins(el)).toEqual(['Manufaktura']);
    });

    it('shows the tapped place, whose visited toggle works', async () => {
      const { fixture, el, api } = await openMap();
      button(el, 'Café Camelot').click();
      await settle(fixture);
      expect(names(el)).toEqual(['Café Camelot']);

      el.querySelector<HTMLButtonElement>('app-place-row .visited')!.click();
      await settle(fixture);
      expect(api.setVisited).toHaveBeenCalledWith('camelot', true);
    });

    it('swaps the command bar for the card while a place is open', async () => {
      const { fixture, el } = await openMap();
      const bar = el.querySelector<HTMLElement>('app-place-bar')!;
      expect(bar.hidden).toBe(false);

      button(el, 'Café Camelot').click();
      await settle(fixture);
      expect(bar.hidden).toBe(true);

      button(el, 'Close place').click();
      await settle(fixture);
      expect(names(el)).toEqual([]);
      expect(bar.hidden).toBe(false);
    });

    it('closes the card when search hides its place', async () => {
      const { fixture, el } = await openMap();
      button(el, 'Café Camelot').click();
      await settle(fixture);

      button(el, 'Visited').click();
      await settle(fixture);
      expect(names(el)).toEqual([]);
      expect(pins(el)).toEqual(['Manufaktura']);
    });
  });
});
