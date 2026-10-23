import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormField, FormRoot, disabled, form, maxLength, required } from '@angular/forms/signals';
import { Subject, catchError, map, of, switchMap, takeUntil } from 'rxjs';
import { AskResponse, CalendarAskService } from '../../core/calendar/calendar-ask.service';
import { Button } from '../../shared/button/button';
import { Card } from '../../shared/card/card';
import { Chip } from '../../shared/chip/chip';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { clockTime, formatDayLabel } from './agenda-dates';
import { formatDuration } from './agenda-model';

export const SUGGESTIONS = ['first event tomorrow', 'am I free friday afternoon?', 'next meeting'];

type AskPhase = 'idle' | 'thinking' | 'answer' | 'cant_do' | 'error';
type AskOutcome = { ok: true; response: AskResponse } | { ok: false };

@Component({
  selector: 'app-ask-bar',
  imports: [Button, Card, Chip, FormField, FormRoot, Icon, Progress, Tag],
  templateUrl: './ask-bar.html',
  styleUrl: './ask-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AskBar {
  private readonly ask = inject(CalendarAskService);
  private readonly questions = new Subject<string>();
  private readonly stops = new Subject<void>();

  readonly jump = output<string>();
  readonly busy = output<boolean>();

  readonly suggestions = SUGGESTIONS;
  private readonly model = signal({ question: '' });
  protected readonly questionForm = form(this.model, (path) => {
    required(path.question);
    maxLength(path.question, 500);
    disabled(path.question, () => this.phase() === 'thinking');
  });
  readonly phase = signal<AskPhase>('idle');
  readonly asked = signal('');
  readonly response = signal<AskResponse | null>(null);
  readonly thoughtSeconds = signal<string | null>(null);
  private startedAt = 0;

  constructor() {
    // switchMap cancels a superseded question; takeUntil(stops) drops a stopped one silently.
    this.questions
      .pipe(
        switchMap((question) => {
          this.startedAt = performance.now();
          return this.ask.ask(question).pipe(
            map((response): AskOutcome => ({ ok: true, response })),
            catchError(() => of<AskOutcome>({ ok: false })),
            takeUntil(this.stops),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => this.finish(outcome));
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.questionForm().invalid()) {
      this.questionForm().markAsTouched();
      return;
    }
    this.submit(this.model().question);
  }

  submit(text: string): void {
    const question = text.trim();
    if (!question || this.phase() === 'thinking') return;

    this.asked.set(question);
    this.model.update((m) => ({ ...m, question: '' }));
    this.response.set(null);
    this.thoughtSeconds.set(null);
    this.phase.set('thinking');
    this.busy.emit(true);
    this.questions.next(question);
  }

  stop(): void {
    this.stops.next();
    this.phase.set('idle');
    this.busy.emit(false);
  }

  close(): void {
    this.response.set(null);
    this.phase.set('idle');
  }

  jumpTo(start: string): void {
    this.jump.emit(start.slice(0, 10));
    this.close();
  }

  // Template helpers.
  eventDay(start: string): string {
    return formatDayLabel(start.slice(0, 10));
  }

  time(start: string): string {
    return clockTime(start);
  }

  duration(minutes: number): string {
    return formatDuration(minutes);
  }

  private finish(outcome: AskOutcome): void {
    if (outcome.ok) {
      this.response.set(outcome.response);
      this.thoughtSeconds.set(((performance.now() - this.startedAt) / 1000).toFixed(1));
      this.phase.set(outcome.response.kind === 'cant_do' ? 'cant_do' : 'answer');
    } else {
      this.phase.set('error');
    }
    this.busy.emit(false);
  }
}
