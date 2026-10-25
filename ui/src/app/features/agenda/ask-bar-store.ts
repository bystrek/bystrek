import { inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Subject, catchError, map, of, pipe, switchMap, takeUntil, tap } from 'rxjs';
import { AskResponse, CalendarAskService } from '../../core/calendar/calendar-ask.service';

export const AskPhase = {
  IDLE: 'idle',
  THINKING: 'thinking',
  ANSWER: 'answer',
  CANT_DO: 'cant_do',
  ERROR: 'error',
} as const;

export type AskPhase = (typeof AskPhase)[keyof typeof AskPhase];
type AskOutcome = { ok: true; response: AskResponse } | { ok: false };

type AskBarState = {
  phase: AskPhase;
  asked: string;
  response: AskResponse | null;
  thoughtSeconds: string | null;
};

// Provided by the Agenda, so the screen can mute itself while a question is in flight.
export const AskBarStore = signalStore(
  withState<AskBarState>({
    phase: AskPhase.IDLE,
    asked: '',
    response: null,
    thoughtSeconds: null,
  }),
  withComputed(({ phase }) => ({
    busy: () => phase() === AskPhase.THINKING,
  })),
  withMethods((store) => {
    const calendarAsk = inject(CalendarAskService);
    // Stopping drops the in-flight answer silently instead of showing an error.
    const stops = new Subject<void>();
    let startedAt = 0;

    const run = rxMethod<string>(
      pipe(
        switchMap((question) => {
          startedAt = performance.now();
          return calendarAsk.ask(question).pipe(
            map((response): AskOutcome => ({ ok: true, response })),
            catchError(() => of<AskOutcome>({ ok: false })),
            takeUntil(stops),
          );
        }),
        tap((outcome) => {
          if (!outcome.ok) {
            patchState(store, { phase: AskPhase.ERROR });
            return;
          }
          patchState(store, {
            response: outcome.response,
            thoughtSeconds: ((performance.now() - startedAt) / 1000).toFixed(1),
            phase: outcome.response.kind === 'cant_do' ? AskPhase.CANT_DO : AskPhase.ANSWER,
          });
        }),
      ),
    );

    return {
      ask(text: string): void {
        patchState(store, {
          asked: text.trim(),
          response: null,
          thoughtSeconds: null,
          phase: AskPhase.THINKING,
        });
        run(text.trim());
      },
      stop(): void {
        stops.next();
        patchState(store, { phase: AskPhase.IDLE });
      },
      close(): void {
        patchState(store, { response: null, phase: AskPhase.IDLE });
      },
    };
  }),
);
