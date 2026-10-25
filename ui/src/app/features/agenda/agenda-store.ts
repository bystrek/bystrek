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
import { catchError, from, map, of, pipe, switchMap, tap, timer } from 'rxjs';
import { CalendarEvent, CalendarService } from '../../core/calendar/calendar.service';
import { buildAgendaRows } from './agenda-rows';

type DayResult = { events: CalendarEvent[] } | { error: string };

type AgendaState = {
  timezone: string;
  selectedDay: Temporal.PlainDate;
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
};

// Browser zone until the account timezone loads; "today" is refined once it does.
const browserZone = Temporal.Now.timeZoneId();

export const AgendaStore = signalStore(
  // Clock, not state: ticks every minute so "Next · in X min" labels stay current.
  withProps(() => ({
    now: toSignal(timer(0, 60_000).pipe(map(() => Temporal.Now.instant())), {
      initialValue: Temporal.Now.instant(),
    }),
  })),
  withState<AgendaState>({
    timezone: browserZone,
    selectedDay: Temporal.Now.plainDateISO(browserZone),
    events: [],
    loading: false,
    error: null,
  }),
  withComputed(({ now, timezone, selectedDay, events }) => {
    const isToday = computed(() =>
      now().toZonedDateTimeISO(timezone()).toPlainDate().equals(selectedDay()),
    );
    const eventCount = computed(() => events().length);
    return {
      rows: computed(() => buildAgendaRows(events(), now())),
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

    // switchMap cancels a superseded request when the user moves to another day.
    const loadDay = rxMethod<Temporal.PlainDate>(
      pipe(
        switchMap((day) => {
          // Wall-clock bounds without an offset: the API reads these in the user's timezone.
          const start = day.toPlainDateTime().toString();
          const end = day.add({ days: 1 }).toPlainDateTime().toString();
          return from(calendar.listEvents(start, end)).pipe(
            map((events): DayResult => ({ events })),
            catchError((err: unknown) =>
              of<DayResult>({
                error: err instanceof Error ? err.message : 'Could not load events.',
              }),
            ),
          );
        }),
        tap((result) => {
          if ('error' in result) {
            patchState(store, { events: [], error: result.error, loading: false });
          } else {
            patchState(store, { events: result.events, loading: false });
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
      // Loads the first day immediately; the account timezone then refines "today".
      init: async (): Promise<void> => {
        showDay(store.selectedDay());
        try {
          patchState(store, { timezone: await calendar.getTimezone() });
        } catch (err) {
          patchState(store, {
            error: err instanceof Error ? err.message : 'Could not load your timezone.',
          });
        }
      },
    };
  }),
  withHooks({
    onInit({ init }) {
      void init();
    },
  }),
);
