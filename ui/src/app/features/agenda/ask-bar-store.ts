import { inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Subject, catchError, map, of, pipe, switchMap, takeUntil, tap } from 'rxjs';
import { AskResponse, CalendarAskService } from '../../core/calendar/calendar-ask.service';
import { SpeechService } from '../../core/speech/speech.service';
import { VoiceRecorder } from '../../core/speech/voice-recorder';

export const AskPhase = {
  IDLE: 'idle',
  LISTENING: 'listening',
  TRANSCRIBING: 'transcribing',
  THINKING: 'thinking',
  ANSWER: 'answer',
  CANT_DO: 'cant_do',
  ERROR: 'error',
} as const;

export type AskPhase = (typeof AskPhase)[keyof typeof AskPhase];

export const AskError = {
  NO_ANSWER: 'Could not get an answer. Try again.',
  NO_MICROPHONE: 'Could not use the microphone. Check its permission and try again.',
  NOT_TRANSCRIBED: 'Could not make out the recording. Try again.',
  NOT_HEARD: "Didn't catch that. Try again.",
} as const;

export type AskError = (typeof AskError)[keyof typeof AskError];

/** Recording stops by itself after this long; questions are a few seconds. */
export const MAX_RECORDING_MS = 15_000;

type AskOutcome = { ok: true; response: AskResponse } | { ok: false };
type TranscribeOutcome = { ok: true; text: string } | { ok: false };

type AskBarState = {
  phase: AskPhase;
  asked: string;
  response: AskResponse | null;
  thoughtSeconds: string | null;
  error: AskError | null;
};

// Provided by the Agenda, so the screen can mute itself while a question is in flight.
export const AskBarStore = signalStore(
  withState<AskBarState>({
    phase: AskPhase.IDLE,
    asked: '',
    response: null,
    thoughtSeconds: null,
    error: null,
  }),
  withComputed(({ phase }) => ({
    busy: () =>
      phase() === AskPhase.LISTENING ||
      phase() === AskPhase.TRANSCRIBING ||
      phase() === AskPhase.THINKING,
  })),
  withMethods((store) => {
    const calendarAsk = inject(CalendarAskService);
    const speech = inject(SpeechService);
    const recorder = inject(VoiceRecorder);
    // Stopping drops the in-flight transcription or answer silently instead of showing an error.
    const stops = new Subject<void>();
    let startedAt = 0;
    let recordingTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: AskError) => patchState(store, { phase: AskPhase.ERROR, error });

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
            fail(AskError.NO_ANSWER);
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

    const ask = (text: string): void => {
      patchState(store, {
        asked: text.trim(),
        response: null,
        thoughtSeconds: null,
        error: null,
        phase: AskPhase.THINKING,
      });
      run(text.trim());
    };

    // A heard question goes straight to the model; the thinking panel shows what was heard.
    const transcribe = rxMethod<Blob>(
      pipe(
        switchMap((audio) =>
          speech.transcribe(audio).pipe(
            map((text): TranscribeOutcome => ({ ok: true, text: text.trim() })),
            catchError(() => of<TranscribeOutcome>({ ok: false })),
            takeUntil(stops),
          ),
        ),
        tap((outcome) => {
          if (!outcome.ok) fail(AskError.NOT_TRANSCRIBED);
          else if (!outcome.text) fail(AskError.NOT_HEARD);
          else ask(outcome.text);
        }),
      ),
    );

    const finishListening = async (): Promise<void> => {
      if (store.phase() !== AskPhase.LISTENING) return;
      clearTimeout(recordingTimer);
      patchState(store, { phase: AskPhase.TRANSCRIBING });
      const audio = await recorder.stop();
      if (store.phase() === AskPhase.TRANSCRIBING) transcribe(audio);
    };

    return {
      ask,
      async listen(): Promise<void> {
        patchState(store, {
          asked: '',
          response: null,
          thoughtSeconds: null,
          error: null,
          phase: AskPhase.LISTENING,
        });
        try {
          await recorder.start();
        } catch {
          fail(AskError.NO_MICROPHONE);
          return;
        }
        // Stopped while the browser was still asking for the microphone.
        if (store.phase() !== AskPhase.LISTENING) {
          recorder.cancel();
          return;
        }
        recordingTimer = setTimeout(finishListening, MAX_RECORDING_MS);
      },
      finishListening,
      stop(): void {
        clearTimeout(recordingTimer);
        recorder.cancel();
        stops.next();
        patchState(store, { phase: AskPhase.IDLE });
      },
      close(): void {
        patchState(store, { response: null, error: null, phase: AskPhase.IDLE });
      },
    };
  }),
);
