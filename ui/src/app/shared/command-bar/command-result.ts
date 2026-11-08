import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../button/button';
import { Card, CardTone } from '../card/card';
import { Icon } from '../icon/icon';
import { Tag } from '../tag/tag';

// One result card in a command bar's result slot: a labelled head with a close button.
@Component({
  selector: 'app-command-result',
  imports: [Button, Card, Icon, Tag],
  template: `
    <app-card [tone]="tone()">
      <div class="head">
        <app-tag variant="solid">{{ label() }}</app-tag>
        <button
          type="button"
          appButton
          shape="icon"
          [attr.aria-label]="closeLabel()"
          (click)="closed.emit()"
        >
          <app-icon name="x" />
        </button>
      </div>
      <ng-content />
    </app-card>
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
