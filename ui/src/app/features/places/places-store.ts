import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  addEntity,
  prependEntity,
  removeEntity,
  setAllEntities,
  setEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { Place, PlacePatch, PlacesService } from '../../core/places/places.service';
import { PlaceRowMode } from './place-row';
import { VisitedFilter, searchPlaces, toSearchable } from './place-search';

export type PlaceListRow = { place: Place; mode: PlaceRowMode };

export const PlacesView = { List: 'list', Map: 'map' } as const;
export type PlacesView = (typeof PlacesView)[keyof typeof PlacesView];

type PlacesState = {
  view: PlacesView;
  query: string;
  visitedFilter: VisitedFilter;
  loading: boolean;
  loadError: string | null;
  // A failed visit toggle or delete; edit errors stay in the edit form.
  actionError: string | null;
  // One row at a time is being edited or asked to confirm a delete.
  editingId: string | null;
  confirmingDeleteId: string | null;
  pendingIds: string[];
  // The pin whose card shows under the map.
  selectedId: string | null;
};

type RowFlags = Pick<PlacesState, 'editingId' | 'confirmingDeleteId' | 'pendingIds'>;

const rowMode = (id: string, state: RowFlags): PlaceRowMode => {
  if (state.pendingIds.includes(id)) return PlaceRowMode.Busy;
  if (state.editingId === id) return PlaceRowMode.Editing;
  if (state.confirmingDeleteId === id) return PlaceRowMode.ConfirmDelete;
  return PlaceRowMode.Idle;
};

// Loads every place once and searches them in memory.
export const PlacesStore = signalStore(
  withEntities<Place>(),
  withState<PlacesState>({
    view: PlacesView.List,
    query: '',
    visitedFilter: VisitedFilter.All,
    loading: false,
    loadError: null,
    actionError: null,
    editingId: null,
    confirmingDeleteId: null,
    pendingIds: [],
    selectedId: null,
  }),
  withComputed((store) => {
    const searchable = computed(() => store.entities().map(toSearchable));
    const visible = computed(() =>
      searchPlaces(searchable(), store.query(), store.visitedFilter()),
    );
    const rows = computed((): PlaceListRow[] => {
      const state: RowFlags = {
        editingId: store.editingId(),
        confirmingDeleteId: store.confirmingDeleteId(),
        pendingIds: store.pendingIds(),
      };
      return visible().map((place) => ({ place, mode: rowMode(place.id, state) }));
    });
    return {
      visible,
      rows,
      // Taken from the filtered rows, so a place that search hides, or that is deleted, also
      // closes its card.
      selected: computed(() => rows().find((row) => row.place.id === store.selectedId()) ?? null),
      isEmpty: computed(() => store.ids().length === 0),
    };
  }),
  withMethods((store) => {
    const places = inject(PlacesService);

    const setPending = (id: string, pending: boolean): void =>
      patchState(store, ({ pendingIds }) => ({
        pendingIds: pending ? [...pendingIds, id] : pendingIds.filter((p) => p !== id),
      }));

    const failAction = (err: unknown): void =>
      patchState(store, { actionError: (err as Error).message });

    // Optimistic: the toggle flips at once and flips back if the API refuses.
    const toggleVisited = async (id: string): Promise<void> => {
      const visited = !store.entityMap()[id].visitedByMe;
      patchState(store, updateEntity({ id, changes: { visitedByMe: visited } }), {
        actionError: null,
      });
      setPending(id, true);
      try {
        await places.setVisited(id, visited);
      } catch (err) {
        patchState(store, updateEntity({ id, changes: { visitedByMe: !visited } }));
        failAction(err);
      } finally {
        setPending(id, false);
      }
    };

    return {
      load: async (): Promise<void> => {
        patchState(store, { loading: true, loadError: null });
        try {
          patchState(store, setAllEntities(await places.list()), { loading: false });
        } catch (err) {
          patchState(store, { loading: false, loadError: (err as Error).message });
        }
      },
      setView: (view: PlacesView): void => patchState(store, { view }),
      select: (selectedId: string | null): void => patchState(store, { selectedId }),
      setQuery: (query: string): void => patchState(store, { query }),
      setVisitedFilter: (visitedFilter: VisitedFilter): void =>
        patchState(store, { visitedFilter }),
      dismissError: (): void => patchState(store, { actionError: null }),
      toggleVisited,

      // A place saved from the command bar goes to the top, like the newest in a fresh load.
      added: (place: Place): void => patchState(store, prependEntity(place)),
      // A draft's duplicate may have been saved by someone else since the list loaded; the
      // list's copy, if any, is the fresher one.
      markVisited: async (place: Place): Promise<void> => {
        patchState(store, addEntity(place));
        if (!store.entityMap()[place.id].visitedByMe) await toggleVisited(place.id);
      },

      askDelete: (id: string): void =>
        patchState(store, { confirmingDeleteId: id, editingId: null, actionError: null }),
      cancelDelete: (): void => patchState(store, { confirmingDeleteId: null }),
      confirmDelete: async (id: string): Promise<void> => {
        patchState(store, { confirmingDeleteId: null });
        setPending(id, true);
        try {
          await places.remove(id);
          patchState(store, removeEntity(id));
        } catch (err) {
          failAction(err);
        } finally {
          setPending(id, false);
        }
      },

      startEdit: (id: string): void =>
        patchState(store, { editingId: id, confirmingDeleteId: null, actionError: null }),
      cancelEdit: (): void => patchState(store, { editingId: null }),
      // Rejects with the API's message (e.g. an address the geocoder can't find) for the form.
      // Another row may have opened its editor meanwhile: only close this row's, and if this
      // row's form is gone, show the failure on the page instead.
      save: async (id: string, patch: PlacePatch): Promise<void> => {
        try {
          const saved = await places.update(id, patch);
          patchState(store, setEntity(saved), ({ editingId }) => ({
            editingId: editingId === id ? null : editingId,
          }));
        } catch (err) {
          if (store.editingId() !== id) failAction(err);
          throw err;
        }
      },
    };
  }),
  withHooks({
    onInit({ load }) {
      void load();
    },
  }),
);
