import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormField, FormRoot, disabled, form, maxLength, required } from '@angular/forms/signals';
import { Temporal } from '@js-temporal/polyfill';
import { Button } from '../../shared/button/button';
import { Card } from '../../shared/card/card';
import { Chip } from '../../shared/chip/chip';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { ClockTimePipe, DurationPipe, WeekdayAndDatePipe } from './agenda-pipes';
import { AskBarStore, AskPhase } from './ask-bar-store';

export const SUGGESTIONS = ['next meeting'];

@Component({
  selector: 'app-ask-bar',
  imports: [
    Button,
    Card,
    Chip,
    ClockTimePipe,
    DurationPipe,
    FormField,
    FormRoot,
    Icon,
    Progress,
    Tag,
    WeekdayAndDatePipe,
  ],
  templateUrl: './ask-bar.html',
  styleUrl: './ask-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AskBar {
  protected readonly store = inject(AskBarStore);
  protected readonly AskPhase = AskPhase;
  readonly jump = output<Temporal.PlainDate>();

  readonly suggestions = SUGGESTIONS;
  private readonly model = signal({ question: '' });
  protected readonly questionForm = form(this.model, (path) => {
    required(path.question);
    maxLength(path.question, 500);
    disabled(path.question, { when: () => this.store.busy() });
  });

  submitQuestion(): void {
    if (this.store.busy()) return;
    if (this.questionForm().invalid()) {
      this.questionForm().markAsTouched();
      return;
    }
    this.store.ask(this.model().question.trim());
    this.model.update((m) => ({ ...m, question: '' }));
  }

  useSuggestion(text: string): void {
    this.model.update((m) => ({ ...m, question: text }));
    this.submitQuestion();
  }

  jumpTo(start: string): void {
    this.jump.emit(Temporal.PlainDate.from(start));
    this.store.close();
  }
}
