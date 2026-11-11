import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
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

// The timeline's command bar with its mode switch. The text belongs to the bar, not a mode, so
// switching keeps whatever was typed.
@Component({
  selector: 'app-timeline-bar',
  imports: [AskBar, LogBar],
  templateUrl: './timeline-bar.html',
  styleUrl: './timeline-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineBar {
  protected readonly askStore = inject(AskBarStore);
  protected readonly logStore = inject(LogBarStore);
  protected readonly BarMode = BarMode;
  protected readonly modes = Object.values(BarMode);
  readonly jump = output<Temporal.PlainDate>();

  readonly mode = signal<BarMode>(BarMode.ASK);
  protected readonly text = signal('');
}
