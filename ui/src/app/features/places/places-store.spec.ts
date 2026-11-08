import { TestBed } from '@angular/core/testing';
import { Place, PlacesService } from '../../core/places/places.service';
import { aPlace } from './place-fixtures';
import { PlaceRowMode } from './place-row';
import { VisitedFilter } from './place-search';
import { PlacesStore } from './places-store';

const camelot = aPlace({ id: 'camelot' });
const manufaktura = aPlace({ id: 'manufaktura', name: 'Manufaktura', address: 'Łódź' });

const setup = (service: Partial<Record<keyof PlacesService, unknown>> = {}) => {
  const api = {
    list: vi.fn(async (): Promise<Place[]> => [camelot, manufaktura]),
    update: vi.fn(),
    remove: vi.fn(async () => undefined),
    setVisited: vi.fn(async () => undefined),
    ...service,
  };
  TestBed.configureTestingModule({
    providers: [PlacesStore, { provide: PlacesService, useValue: api }],
  });
  return { store: TestBed.inject(PlacesStore), api };
};

const loaded = async (service?: Parameters<typeof setup>[0]) => {
  const result = setup(service);
  await vi.waitFor(() => expect(result.store.loading()).toBe(false));
  return result;
};

const rowIds = (store: InstanceType<typeof PlacesStore>) => store.rows().map((r) => r.place.id);
const modeOf = (store: InstanceType<typeof PlacesStore>, id: string) =>
  store.rows().find((r) => r.place.id === id)?.mode;

describe('PlacesStore', () => {
  it('loads every place once and filters them in memory', async () => {
    const { store, api } = await loaded();
    expect(rowIds(store)).toEqual(['camelot', 'manufaktura']);

    store.setQuery('lodz');
    expect(rowIds(store)).toEqual(['manufaktura']);
    store.setQuery('');
    store.setVisitedFilter(VisitedFilter.Visited);
    expect(rowIds(store)).toEqual([]);
    expect(store.isEmpty()).toBe(false);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('shows a load failure and loads again on retry', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([camelot]);
    const { store } = await loaded({ list });
    expect(store.loadError()).toBe('offline');

    await store.load();
    expect(store.loadError()).toBeNull();
    expect(rowIds(store)).toEqual(['camelot']);
  });

  it('flips visited at once and keeps it when the API agrees', async () => {
    let finish!: () => void;
    const setVisited = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { store } = await loaded({ setVisited });

    const toggling = store.toggleVisited('camelot');
    expect(store.entityMap()['camelot'].visitedByMe).toBe(true);
    expect(modeOf(store, 'camelot')).toBe(PlaceRowMode.Busy);
    finish();
    await toggling;

    expect(setVisited).toHaveBeenCalledWith('camelot', true);
    expect(store.entityMap()['camelot'].visitedByMe).toBe(true);
    expect(modeOf(store, 'camelot')).toBe(PlaceRowMode.Idle);
  });

  it('flips visited back and reports it when the API refuses', async () => {
    const setVisited = vi.fn().mockRejectedValue(new Error('Could not update the visit.'));
    const { store } = await loaded({ setVisited });

    await store.toggleVisited('camelot');
    expect(store.entityMap()['camelot'].visitedByMe).toBe(false);
    expect(store.actionError()).toBe('Could not update the visit.');
  });

  it('deletes only after confirming', async () => {
    const { store, api } = await loaded();

    store.askDelete('camelot');
    expect(modeOf(store, 'camelot')).toBe(PlaceRowMode.ConfirmDelete);
    store.cancelDelete();
    expect(modeOf(store, 'camelot')).toBe(PlaceRowMode.Idle);
    expect(api.remove).not.toHaveBeenCalled();

    store.askDelete('camelot');
    await store.confirmDelete('camelot');
    expect(api.remove).toHaveBeenCalledWith('camelot');
    expect(rowIds(store)).toEqual(['manufaktura']);
  });

  it('keeps the place when the delete fails', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('Could not delete the place.'));
    const { store } = await loaded({ remove });

    await store.confirmDelete('camelot');
    expect(rowIds(store)).toEqual(['camelot', 'manufaktura']);
    expect(store.actionError()).toBe('Could not delete the place.');
  });

  it('replaces the place with the saved one and closes the editor', async () => {
    const saved = { ...camelot, address: 'Floriańska 1, Kraków', displayAddress: 'Floriańska 1' };
    const update = vi.fn(async () => saved);
    const { store } = await loaded({ update });

    store.startEdit('camelot');
    expect(modeOf(store, 'camelot')).toBe(PlaceRowMode.Editing);
    await store.save('camelot', { address: saved.address });

    expect(update).toHaveBeenCalledWith('camelot', { address: saved.address });
    expect(store.entityMap()['camelot'].displayAddress).toBe('Floriańska 1');
    expect(rowIds(store)).toEqual(['camelot', 'manufaktura']);
    expect(store.editingId()).toBeNull();
  });

  it('leaves another row’s editor open when an earlier save finishes', async () => {
    let finish!: (place: Place) => void;
    const update = vi.fn(() => new Promise<Place>((resolve) => (finish = resolve)));
    const { store } = await loaded({ update });

    store.startEdit('camelot');
    const saving = store.save('camelot', { name: 'Camelot' });
    store.startEdit('manufaktura');
    finish({ ...camelot, name: 'Camelot' });
    await saving;

    expect(store.editingId()).toBe('manufaktura');
    expect(store.entityMap()['camelot'].name).toBe('Camelot');
  });

  it('shows a failed save on the page once its editor has closed', async () => {
    let fail!: (err: Error) => void;
    const update = vi.fn(() => new Promise<Place>((_, reject) => (fail = reject)));
    const { store } = await loaded({ update });

    store.startEdit('camelot');
    const saving = store.save('camelot', { address: 'nowhere' });
    store.startEdit('manufaktura');
    fail(new Error("Couldn't find that address"));
    await expect(saving).rejects.toThrow();

    expect(store.editingId()).toBe('manufaktura');
    expect(store.actionError()).toBe("Couldn't find that address");
  });

  it('keeps the editor open when the save fails', async () => {
    const update = vi.fn().mockRejectedValue(new Error("Couldn't find that address"));
    const { store } = await loaded({ update });

    store.startEdit('camelot');
    await expect(store.save('camelot', { address: 'nowhere' })).rejects.toThrow(
      "Couldn't find that address",
    );
    expect(store.editingId()).toBe('camelot');
    expect(store.actionError()).toBeNull();
  });
});
