import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  model,
  output,
} from '@angular/core';
import { FormField, FormRoot, disabled, form, maxLength, required } from '@angular/forms/signals';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';
import { Progress } from '../progress/progress';

// The prompt bar shared by the per-page assistants: input, thinking, stop, and slots for the
// result (`[commandBarResult]`, above the input) and hints (`[commandBarHint]`, under it).
// The page owns the text, so it decides whether a submit clears it.
@Component({
  selector: 'app-command-bar',
  imports: [Button, FormField, FormRoot, Icon, Progress],
  templateUrl: './command-bar.html',
  styleUrl: './command-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandBar {
  readonly text = model('');
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly submitLabel = input.required<string>();
  readonly thinkingLabel = input.required<string>();
  readonly maxLength = input(500);
  readonly busy = input(false);
  // Locks the input without the thinking state, e.g. while the page saves a result.
  readonly locked = input(false);
  // What was sent, echoed while thinking.
  readonly asked = input('');
  // Shows a clear button while there is text; the page decides what clearing resets.
  readonly clearable = input(false, { transform: booleanAttribute });

  readonly submitted = output<string>();
  readonly stopped = output<void>();
  readonly cleared = output<void>();

  protected readonly textForm = form(this.text, (path) => {
    required(path);
    maxLength(path, () => this.maxLength());
    disabled(path, { when: () => this.busy() || this.locked() });
  });

  submit(): void {
    if (this.busy() || this.locked()) return;
    if (this.textForm().invalid()) {
      this.textForm().markAsTouched();
      return;
    }
    this.submitted.emit(this.text().trim());
  }
}
