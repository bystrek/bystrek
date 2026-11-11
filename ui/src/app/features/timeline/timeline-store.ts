import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Temporal } from '@js-temporal/polyfill';
import { catchError, forkJoin, map, of, pipe, switchMap, tap, timer } from 'rxjs';
import { Router } from '@angular/router';
import {
  CalendarEvent,
  CalendarNotReadyError,
  CalendarService,
} from '../../core/calendar/calendar.service';
import { DiaryEvent, DiaryService } from '../../core/diary/diary.service';
import { buildTimelineRows } from './timeline-rows';

type DayResult = { events: CalendarEvent[]; logged: DiaryEvent[] } | { error: string };

type TimelineState = {
  timezone: string;
  selectedDay: Temporal.PlainDate;
  events: CalendarEvent[];
  logged: DiaryEvent[];
  loading: boolean;
  error: string | null;
};

// Browser zone until the account timezone loads; "today" is refined once it does.
const browserZone = Temporal.Now.timeZoneId();

export const TimelineStore = signalStore(
  // Clock, not state: ticks every minute so "Next · in X min" labels stay current.
  withProps(() => ({
    now: toSignal(timer(0, 60_000).pipe(map(() => Temporal.Now.instant())), {
      initialValue: Temporal.Now.instant(),
    }),
  })),
  withState<TimelineState>({
    timezone: browserZone,
    selectedDay: Temporal.Now.plainDateISO(browserZone),
    events: [],
    logged: [],
    loading: false,
    error: null,
  }),
  withComputed(({ now, timezone, selectedDay, events, logged }) => {
    const isToday = computed(() =>
      now().toZonedDateTimeISO(timezone()).toPlainDate().equals(selectedDay()),
    );
    const eventCount = computed(() => events().length);
    return {
      rows: computed(() =>
        buildTimelineRows(events(), logged(), {
          day: selectedDay(),
          timeZone: timezone(),
          now: now(),
        }),
      ),
      isToday,
      subtitle: computed(() => {
        const count = eventCount();
        const label = count === 1 ? '1 EVENT' : `${count} EVENTS`;
        return isToday() ? `TODAY · ${label}` : label;
      }),
    };
  }),
  withMethods((store) => {
    const calendar = inject(CalendarService);
    const diary = inject(DiaryService);
    const router = inject(Router);

    // switchMap cancels a superseded request when the user moves to another day.
    const loadDay = rxMethod<Temporal.PlainDate>(
      pipe(
        switchMap((day) => {
          // Wall-clock bounds without an offset: the API reads these in the user's timezone.
          const start = day.toPlainDateTime().toString();
          const end = day.add({ days: 1 }).toPlainDateTime().toString();
          // The diary API takes instants, so its bounds are pinned to the account timezone.
          const from = day.toZonedDateTime(store.timezone()).toInstant().toString();
          const to = day.add({ days: 1 }).toZonedDateTime(store.timezone()).toInstant().toString();
          // Logged events reach a day before it starts and after it ends; the row builder keeps
          // the ones that belong to it.
          return forkJoin({
            events: calendar.listEvents(start, end),
            logged: diary.listEvents(from, to),
          }).pipe(
            map((result): DayResult => result),
            catchError((err: unknown) => {
              // The guard let us in, but the API dropped its copy since: back to the sync screen.
              if (err instanceof CalendarNotReadyError) void router.navigateByUrl('/sync');
              return of<DayResult>({
                error: err instanceof Error ? err.message : 'Could not load events.',
              });
            }),
          );
        }),
        tap((result) => {
          if ('error' in result) {
            patchState(store, { events: [], logged: [], error: result.error, loading: false });
          } else {
            patchState(store, { ...result, loading: false });
          }
        }),
      ),
    );

    const showDay = (day: Temporal.PlainDate): void => {
      patchState(store, { selectedDay: day, loading: true, error: null });
      loadDay(day);
    };

    return {
      jumpToDay: showDay,
      nextDay: (): void => showDay(store.selectedDay().add({ days: 1 })),
      previousDay: (): void => showDay(store.selectedDay().add({ days: -1 })),
      // The account timezone comes first: it sets the diary bounds and refines "today".
      // Without it the browser zone stands in.
      init: async (): Promise<void> => {
        let error: string | null = null;
        patchState(store, { loading: true });
        try {
          patchState(store, { timezone: await calendar.getTimezone() });
        } catch (err) {
          error = err instanceof Error ? err.message : 'Could not load your timezone.';
        }
        showDay(store.selectedDay());
        if (error) patchState(store, { error });
      },
    };
  }),
  withHooks({
    onInit({ init }) {
      void init();
    },
  }),
);
