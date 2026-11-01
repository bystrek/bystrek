import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, from, pipe, switchMap, takeWhile, tap, timer } from 'rxjs';
import {
  CalendarSyncService,
  SyncProgress,
  SyncStatus,
} from '../../core/calendar/calendar-sync.service';

export const POLL_INTERVAL_MS = 1000;

type SyncState = {
  progress: SyncProgress | null;
  // Set when the API itself couldn't be reached, as opposed to a failed download.
  requestError: string | null;
  retrying: boolean;
};

const isDone = (progress: SyncProgress | null): boolean =>
  progress?.status === SyncStatus.READY || progress?.status === SyncStatus.ERROR;

// Polls the first download until it is ready (then opens the agenda) or fails.
export const SyncStore = signalStore(
  withState<SyncState>({ progress: null, requestError: null, retrying: false }),
  withMethods((store) => {
    const sync = inject(CalendarSyncService);
    const router = inject(Router);

    // switchMap restarts the loop on retry; takeWhile ends it at ready or error.
    const poll = rxMethod<void>(
      pipe(
        switchMap(() =>
          timer(0, POLL_INTERVAL_MS).pipe(
            switchMap(() => from(sync.progress())),
            tap((progress) => {
              if (!progress) {
                void router.navigateByUrl('/connect');
                return;
              }
              patchState(store, { progress, requestError: null });
              if (progress.status === SyncStatus.READY) void router.navigateByUrl('/agenda');
            }),
            takeWhile((progress) => progress !== null && !isDone(progress)),
            catchError((err: unknown) => {
              patchState(store, {
                requestError: err instanceof Error ? err.message : 'Could not check the sync.',
              });
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    return {
      poll,
      retry: async (): Promise<void> => {
        patchState(store, { retrying: true, requestError: null });
        try {
          // A request error (API unreachable) only needs polling again.
          if (store.progress()?.status === SyncStatus.ERROR) {
            patchState(store, { progress: await sync.retry() });
          }
          poll();
        } catch (err) {
          patchState(store, {
            requestError: err instanceof Error ? err.message : 'Could not restart the sync.',
          });
        } finally {
          patchState(store, { retrying: false });
        }
      },
    };
  }),
  withHooks({
    onInit({ poll }) {
      poll();
    },
  }),
);
