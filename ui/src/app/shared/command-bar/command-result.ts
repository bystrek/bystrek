import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

type CardTone = 'surface' | 'primary' | 'danger';

// One result card in a command bar's result slot: a labelled head with a close button.
@Component({
  selector: 'app-command-result',
  imports: [Icon],
  template: `
    <div class="ek-card" [attr.data-tone]="tone()">
      <div class="head">
        <span class="ek-tag" data-variant="solid">{{ label() }}</span>
        <button
          class="ek-button"
          type="button"
          data-shape="icon"
          [attr.aria-label]="closeLabel()"
          (click)="closed.emit()"
        >
          <app-icon name="x" />
        </button>
      </div>
      <ng-content />
    </div>
  `,
  styleUrl: './command-result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandResult {
  readonly tone = input<CardTone>('primary');
  readonly label = input.required<string>();
  readonly closeLabel = input('Close answer');
  readonly closed = output<void>();
}
