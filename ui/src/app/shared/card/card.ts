import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CardTone = 'surface' | 'primary' | 'danger';
export type CardWeight = 'heavy' | 'thin';

@Component({
  selector: 'app-card',
  template: `<ng-content />`,
  styleUrl: './card.css',
  host: {
    '[attr.data-tone]': 'tone()',
    '[attr.data-weight]': 'weight()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly tone = input<CardTone>('surface');
  readonly weight = input<CardWeight>('heavy');
}
