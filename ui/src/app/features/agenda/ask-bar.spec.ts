import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { CalendarAskService, AskResponse } from '../../core/calendar/calendar-ask.service';
import { SpeechService } from '../../core/speech/speech.service';
import { VoiceRecorder } from '../../core/speech/voice-recorder';
import { AskBar } from './ask-bar';
import { AskBarStore, AskError, AskPhase } from './ask-bar-store';

const AUDIO = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

class FakeRecorder {
  supported = true;
  recording = false;
  start = async () => {
    this.recording = true;
  };
  stop = async () => {
    this.recording = false;
    return AUDIO;
  };
  cancel = () => {
    this.recording = false;
  };
}

const configure = (
  ask: (question: string) => unknown,
  transcribe: (audio: Blob) => unknown = () => of(''),
  recorder = new FakeRecorder(),
) => {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
      { provide: CalendarAskService, useValue: { ask } },
      { provide: SpeechService, useValue: { transcribe } },
      { provide: VoiceRecorder, useValue: recorder },
      AskBarStore,
    ],
  });
  return recorder;
};

describe('AskBar', () => {
  it("shows the can't-do card for a write request", () => {
    const response: AskResponse = { kind: 'cant_do', text: 'I can only read your calendar.' };
    configure(() => of(response));
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    fixture.componentInstance.useSuggestion('delete my dentist appointment');
    fixture.detectChanges();

    expect(TestBed.inject(AskBarStore).phase()).toBe(AskPhase.CANT_DO);
    expect(el.querySelector<HTMLElement>('app-card')?.dataset['tone']).toBe('danger');
    expect(el.textContent).toContain('I can only read your calendar.');
  });

  it('cancels the in-flight question when stopped', () => {
    const pending = new Subject<AskResponse>();
    configure(() => pending.asObservable());
    const fixture = TestBed.createComponent(AskBar);
    const store = TestBed.inject(AskBarStore);

    fixture.componentInstance.useSuggestion('next meeting');
    expect(store.phase()).toBe(AskPhase.THINKING);
    store.stop();

    expect(store.phase()).toBe(AskPhase.IDLE);
    expect(pending.observed).toBe(false);
  });

  it('shows how long the answer took', () => {
    const response: AskResponse = { kind: 'text', text: 'Nothing else today.' };
    configure(() => of(response));
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();

    fixture.componentInstance.useSuggestion('anything else today?');
    fixture.detectChanges();

    const thought = fixture.nativeElement.querySelector('.answer-thought')?.textContent ?? '';
    expect(thought).toMatch(/^Thought for \d+\.\d s$/);
  });

  it('lists every event in a multi-event answer', () => {
    const response: AskResponse = {
      kind: 'list',
      text: '2 events.',
      events: [
        {
          uid: 'a',
          title: 'Dentist',
          start: '2026-10-27T09:00:00+01:00',
          end: '2026-10-27T09:45:00+01:00',
          startWeekday: 'Tuesday',
          durationMinutes: 45,
        },
        {
          uid: 'b',
          title: 'Team sync',
          start: '2026-10-27T11:00:00+01:00',
          end: '2026-10-27T11:30:00+01:00',
          startWeekday: 'Tuesday',
          durationMinutes: 30,
        },
      ],
    };
    configure(() => of(response));
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();

    fixture.componentInstance.useSuggestion('what events do I have on Tuesday?');
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.conflicts li');
    expect(items.length).toBe(2);
    expect(items[1].textContent).toContain('Team sync');
  });

  describe('by voice', () => {
    it('asks the transcribed question', async () => {
      const asked: string[] = [];
      const response: AskResponse = { kind: 'text', text: 'Nothing else today.' };
      const transcribed: Blob[] = [];
      configure(
        (q) => (asked.push(q), of(response)),
        (audio) => (transcribed.push(audio), of(' next meeting ')),
      );
      const fixture = TestBed.createComponent(AskBar);
      fixture.detectChanges();
      const store = TestBed.inject(AskBarStore);
      const el: HTMLElement = fixture.nativeElement;

      el.querySelector<HTMLButtonElement>('[aria-label="Ask by voice"]')!.click();
      await fixture.whenStable();
      expect(store.phase()).toBe(AskPhase.LISTENING);
      expect(el.querySelector('[aria-label="Done speaking"]')).not.toBeNull();

      await store.finishListening();
      fixture.detectChanges();

      expect(transcribed).toEqual([AUDIO]);
      expect(asked).toEqual(['next meeting']);
      expect(store.asked()).toBe('next meeting');
      expect(store.phase()).toBe(AskPhase.ANSWER);
    });

    it("says it didn't catch an empty transcript instead of asking", async () => {
      const asked: string[] = [];
      configure(
        (q) => (asked.push(q), of()),
        () => of(''),
      );
      const fixture = TestBed.createComponent(AskBar);
      const store = TestBed.inject(AskBarStore);

      await store.listen();
      await store.finishListening();
      fixture.detectChanges();

      expect(asked).toEqual([]);
      expect(store.phase()).toBe(AskPhase.ERROR);
      expect(fixture.nativeElement.textContent).toContain(AskError.NOT_HEARD);
    });

    it('explains a refused microphone', async () => {
      const recorder = new FakeRecorder();
      recorder.start = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
      configure(() => of(), undefined, recorder);
      TestBed.createComponent(AskBar);
      const store = TestBed.inject(AskBarStore);

      await store.listen();

      expect(store.phase()).toBe(AskPhase.ERROR);
      expect(store.error()).toBe(AskError.NO_MICROPHONE);
    });

    it('drops the recording when cancelled', async () => {
      const transcribed: Blob[] = [];
      const recorder = configure(
        () => of(),
        (audio) => (transcribed.push(audio), of('next meeting')),
      );
      TestBed.createComponent(AskBar);
      const store = TestBed.inject(AskBarStore);

      await store.listen();
      store.stop();
      await store.finishListening();

      expect(recorder.recording).toBe(false);
      expect(transcribed).toEqual([]);
      expect(store.phase()).toBe(AskPhase.IDLE);
    });

    it('cancels the in-flight transcription when stopped', async () => {
      const pending = new Subject<string>();
      configure(
        () => of(),
        () => pending.asObservable(),
      );
      TestBed.createComponent(AskBar);
      const store = TestBed.inject(AskBarStore);

      await store.listen();
      await store.finishListening();
      expect(store.phase()).toBe(AskPhase.TRANSCRIBING);
      store.stop();

      expect(store.phase()).toBe(AskPhase.IDLE);
      expect(pending.observed).toBe(false);
    });
  });
});
