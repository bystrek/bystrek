import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Subject, catchError, map, of, pipe, switchMap, takeUntil, tap } from 'rxjs';
import {
  GeocodedLocation,
  PlaceDraftResponse,
  PlaceDraftService,
} from '../../core/places/place-draft.service';
import { Place, PlacesService } from '../../core/places/places.service';
import { errorMessage } from '../../core/http/error-message';
import { PlacesStore } from './places-store';

export const PlaceBarPhase = {
  Idle: 'idle',
  Thinking: 'thinking',
  Drafted: 'drafted',
  Error: 'error',
} as const;
export type PlaceBarPhase = (typeof PlaceBarPhase)[keyof typeof PlaceBarPhase];

type DraftOutcome = { ok: true; response: PlaceDraftResponse } | { ok: false; message: string };

type PlaceBarState = {
  // The prompt stays after a draft so it can be refined; only a save or cancel clears it.
  text: string;
  asked: string;
  phase: PlaceBarPhase;
  response: PlaceDraftResponse | null;
  error: string | null;
  saving: boolean;
  saveError: string | null;
};

const initialState: PlaceBarState = {
  text: '',
  asked: '',
  phase: PlaceBarPhase.Idle,
  response: null,
  error: null,
  saving: false,
  saveError: null,
};

// The /places command bar: a prompt in, a draft out, and a confirm that saves it to the list.
// Provided next to PlacesStore, which it adds saved places to.
export const PlaceBarStore = signalStore(
  withState(initialState),
  withComputed(({ phase, response, saving }) => {
    const placesStore = inject(PlacesStore);
    return {
      busy: computed(() => phase() === PlaceBarPhase.Thinking),
      // A list load still in flight would replace the saved place with its older snapshot.
      canSave: computed(() => !saving() && !placesStore.loading()),
      // The list's copy of a duplicate, so a visit marked here or in the list shows in both.
      duplicate: computed((): Place | null => {
        const r = response();
        if (r?.kind !== 'duplicate') return null;
        return placesStore.entityMap()[r.place.id] ?? r.place;
      }),
    };
  }),
  withMethods((store) => {
    const drafts = inject(PlaceDraftService);
    const places = inject(PlacesService);
    const placesStore = inject(PlacesStore);
    // Stopping drops the in-flight draft silently instead of showing an error.
    const stops = new Subject<void>();

    const run = rxMethod<string>(
      pipe(
        switchMap((text) =>
          drafts.draft(text).pipe(
            map((response): DraftOutcome => ({ ok: true, response })),
            catchError((err) =>
              of<DraftOutcome>({
                ok: false,
                message: errorMessage(err, "Couldn't draft that. Try again."),
              }),
            ),
            takeUntil(stops),
          ),
        ),
        tap((outcome) =>
          patchState(
            store,
            outcome.ok
              ? { phase: PlaceBarPhase.Drafted, response: outcome.response }
              : { phase: PlaceBarPhase.Error, error: outcome.message },
          ),
        ),
      ),
    );

    const reset = (): void => {
      stops.next();
      patchState(store, initialState);
    };

    return {
      setText: (text: string): void => patchState(store, { text }),
      // Always the whole prompt: a refinement is the edited text, never a diff.
      submit: (text: string): void => {
        // Finishing the save clears the bar, which would drop a newer prompt.
        if (store.saving()) return;
        patchState(store, {
          asked: text,
          phase: PlaceBarPhase.Thinking,
          response: null,
          error: null,
          saveError: null,
        });
        run(text);
      },
      stop: (): void => {
        stops.next();
        patchState(store, { phase: PlaceBarPhase.Idle });
      },
      // Hides the result but keeps the prompt for another try.
      dismiss: (): void =>
        patchState(store, { phase: PlaceBarPhase.Idle, response: null, error: null }),
      cancel: reset,

      // Picking a candidate doesn't call the model again: it becomes the preview's location.
      choose: (location: GeocodedLocation): void => {
        const r = store.response();
        if (r?.kind !== 'needs_choice') return;
        patchState(store, { response: { kind: 'ready', draft: r.draft, location } });
      },

      save: async (): Promise<void> => {
        const r = store.response();
        if (r?.kind !== 'ready' || !store.canSave()) return;
        const { name, category, address, notes, url } = r.draft;
        const { osmType, osmId } = r.location;
        patchState(store, { saving: true, saveError: null });
        try {
          const place = await places.create({
            name,
            category,
            address,
            notes,
            url,
            osmType,
            osmId,
          });
          placesStore.added(place);
          reset();
        } catch (err) {
          patchState(store, { saving: false, saveError: (err as Error).message });
        }
      },

      markVisited: async (): Promise<void> => {
        const r = store.response();
        if (r?.kind === 'duplicate') await placesStore.markVisited(r.place);
      },
    };
  }),
);
