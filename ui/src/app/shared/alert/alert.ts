import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { Button } from '../button/button';
import { Card, CardTone } from '../card/card';
import { Icon, IconName } from '../icon/icon';

export type AlertTone = 'danger' | 'primary' | 'neutral';

const CARD_TONE: Record<AlertTone, CardTone> = {
  danger: 'danger',
  primary: 'primary',
  neutral: 'surface',
};

const ICON: Record<AlertTone, IconName> = {
  danger: 'warning',
  primary: 'check',
  neutral: 'info',
};

@Component({
  selector: 'app-alert',
  imports: [Button, Card, Icon],
  template: `
    <app-card [tone]="cardTone()">
      <div class="head">
        <app-icon class="icon" [name]="icon()" />
        <strong class="heading">{{ heading() }}</strong>
        @if (dismissible()) {
          <button
            appButton
            shape="icon"
            type="button"
            aria-label="Dismiss"
            (click)="dismissed.emit()"
          >
            <app-icon name="x" />
          </button>
        }
      </div>
      <div class="body"><ng-content /></div>
    </app-card>
  `,
  styleUrl: './alert.css',
  host: { '[attr.role]': 'tone() === "danger" ? "alert" : "status"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alert {
  readonly tone = input<AlertTone>('neutral');
  readonly heading = input.required<string>();
  readonly dismissible = input(true, { transform: booleanAttribute });
  readonly dismissed = output<void>();

  protected readonly cardTone = computed(() => CARD_TONE[this.tone()]);
  protected readonly icon = computed(() => ICON[this.tone()]);
}
