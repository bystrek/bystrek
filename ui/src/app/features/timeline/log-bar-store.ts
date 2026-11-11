import { computed, inject, signal } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Temporal } from '@js-temporal/polyfill';
import {
  Subject,
  catchError,
  forkJoin,
  from,
  map,
  of,
  pipe,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { DiaryCategory, DiaryDraftResponse, DiaryService } from '../../core/diary/diary.service';
import { errorMessage } from '../../core/http/error-message';
import { LogDraftForm, emptyLogDraft, toLogDraftForm, toNewNote } from './log-draft';
import { TimelineStore } from './timeline-store';
import { loggedDay } from './timeline-rows';

export const LogPhase = {
  IDLE: 'idle',
  DRAFTING: 'drafting',
  DRAFTED: 'drafted',
  ERROR: 'error',
} as const;

export type LogPhase = (typeof LogPhase)[keyof typeof LogPhase];

type Drafted = { response: DiaryDraftResponse; categories: DiaryCategory[] };
type DraftOutcome = ({ ok: true } & Drafted) | { ok: false; message: string };

type LogBarState = {
  phase: LogPhase;
  // The note as sent: saved as the raw text, and the bar's text matching it means Enter confirms.
  asked: string;
  capturedAt: string;
  response: DiaryDraftResponse | null;
  // The user's categories when the note was drafted, for the card's category picker.
  categories: DiaryCategory[];
  error: string | null;
  saving: boolean;
  saveError: string | null;
};

const initialState: LogBarState = {
  phase: LogPhase.IDLE,
  asked: '',
  capturedAt: '',
  response: null,
  categories: [],
  error: null,
  saving: false,
  saveError: null,
};

// The timeline bar's log mode: a note in, a draft out, and a confirm that saves it and shows
// the day it landed on. Provided next to TimelineStore.
export const LogBarStore = signalStore(
  withState(initialState),
  // The card's edits, kept here so they survive a switch to ask mode and back. A plain signal,
  // so the card can bind a signal form to it.
  withProps(() => ({ edits: signal<LogDraftForm>(emptyLogDraft()) })),
  withComputed(({ phase, response }) => ({
    busy: computed(() => phase() === LogPhase.DRAFTING),
    confirmable: computed(() => phase() === LogPhase.DRAFTED && response()?.kind === 'draft'),
  })),
  withMethods((store) => {
    const diary = inject(DiaryService);
    const timeline = inject(TimelineStore);
    // Stopping drops the in-flight draft silently instead of showing an error.
    const stops = new Subject<void>();

    const run = rxMethod<{ text: string; capturedAt: string }>(
      pipe(
        switchMap(({ text, capturedAt }) =>
          forkJoin({
            response: diary.draft(text, capturedAt),
            categories: from(diary.listCategories()),
          }).pipe(
            map((drafted): DraftOutcome => ({ ok: true, ...drafted })),
            catchError((err) =>
              of<DraftOutcome>({
                ok: false,
                message: errorMessage(err, "Couldn't draft that. Try again."),
              }),
            ),
            takeUntil(stops),
          ),
        ),
        tap((outcome) => {
          if (!outcome.ok) {
            patchState(store, { phase: LogPhase.ERROR, error: outcome.message });
            return;
          }
          const { response, categories } = outcome;
          store.edits.set(
            response.kind === 'draft'
              ? toLogDraftForm(response, timeline.timezone())
              : emptyLogDraft(),
          );
          patchState(store, { phase: LogPhase.DRAFTED, response, categories });
        }),
      ),
    );

    const reset = (): void => {
      stops.next();
      store.edits.set(emptyLogDraft());
      patchState(store, initialState);
    };

    return {
      // Enter on the bar confirms the draft shown, unless the note was changed since.
      confirms: (text: string): boolean => store.confirmable() && text === store.asked(),

      // Always the whole note: refining means sending the edited note again.
      submit: (text: string): void => {
        // Finishing the save resets the bar, which would drop a newer draft.
        if (store.saving()) return;
        const capturedAt = Temporal.Now.instant().toString();
        patchState(store, {
          asked: text,
          capturedAt,
          phase: LogPhase.DRAFTING,
          response: null,
          error: null,
          saveError: null,
        });
        run({ text, capturedAt });
      },
      stop: (): void => {
        stops.next();
        patchState(store, { phase: LogPhase.IDLE });
      },
      // Hides the card but keeps the note in the bar for another try. Not while saving: a failed
      // save shows its error and the edits on the card.
      dismiss: (): void => {
        if (store.saving()) return;
        patchState(store, { phase: LogPhase.IDLE, response: null, error: null });
      },
      cancel: reset,

      // Saves the edited draft and moves the timeline to the day it landed on. True once saved.
      save: async (): Promise<boolean> => {
        if (!store.confirmable() || store.saving()) return false;
        const timeZone = timeline.timezone();
        const note = toNewNote(store.edits(), {
          rawText: store.asked(),
          capturedAt: store.capturedAt(),
          timeZone,
        });
        patchState(store, { saving: true, saveError: null });
        try {
          const [first] = await diary.createNote(note);
          timeline.jumpToDay(loggedDay(first, timeZone));
          reset();
          return true;
        } catch (err) {
          patchState(store, { saving: false, saveError: (err as Error).message });
          return false;
        }
      },
    };
  }),
);
