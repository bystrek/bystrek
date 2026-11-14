import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { EkSegmentedControl, EkFormControl } from '@ekierka/angular';
import { Temporal } from '@js-temporal/polyfill';
import { AskBar } from './ask-bar';
import { AskBarStore } from './ask-bar-store';
import { LogBar } from './log-bar';
import { LogBarStore } from './log-bar-store';

// Ask reads the calendar; log writes to the diary. The user picks, the model never guesses.
export const BarMode = {
  ASK: 'ask',
  LOG: 'log',
} as const;

export type BarMode = (typeof BarMode)[keyof typeof BarMode];

const MODE_OPTIONS = Object.values(BarMode).map((mode) => ({ value: mode, label: mode }));

// The timeline's command bar with its mode switch. The text belongs to the bar, not a mode, so
// switching keeps whatever was typed.
@Component({
  selector: 'app-timeline-bar',
  imports: [AskBar, LogBar, EkSegmentedControl, EkFormControl, FormField],
  templateUrl: './timeline-bar.html',
  styleUrl: './timeline-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineBar {
  protected readonly askStore = inject(AskBarStore);
  protected readonly logStore = inject(LogBarStore);
  protected readonly BarMode = BarMode;
  protected readonly modeOptions = MODE_OPTIONS;
  readonly jump = output<Temporal.PlainDate>();

  protected readonly text = signal('');
  // The mode stays put while a question or a save is in flight.
  protected readonly bar = form(signal<{ mode: BarMode }>({ mode: BarMode.ASK }), (path) =>
    disabled(
      path.mode,
      () => this.askStore.busy() || this.logStore.busy() || this.logStore.saving(),
    ),
  );
}
