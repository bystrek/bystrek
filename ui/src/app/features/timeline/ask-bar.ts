import { ChangeDetectionStrategy, Component, inject, model, output } from '@angular/core';
import { Temporal } from '@js-temporal/polyfill';
import { Button } from '../../shared/button/button';
import { Chip } from '../../shared/chip/chip';
import { CommandBar } from '../../shared/command-bar/command-bar';
import { CommandResult } from '../../shared/command-bar/command-result';
import { Icon } from '../../shared/icon/icon';
import { ClockTimePipe, DurationPipe, WeekdayAndDatePipe } from './timeline-pipes';
import { AskBarStore, AskPhase } from './ask-bar-store';

export const SUGGESTIONS = ['next meeting'];

// The timeline bar in ask mode. A question clears the input once it is sent.
@Component({
  selector: 'app-ask-bar',
  imports: [
    Button,
    Chip,
    ClockTimePipe,
    CommandBar,
    CommandResult,
    DurationPipe,
    Icon,
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
  // Shared with log mode, so switching modes keeps what was typed.
  readonly text = model('');

  ask(text: string): void {
    this.store.ask(text);
    this.text.set('');
  }

  useSuggestion(text: string): void {
    if (this.store.busy()) return;
    this.ask(text);
  }

  jumpTo(start: string): void {
    this.jump.emit(Temporal.PlainDate.from(start));
    this.store.close();
  }
}
