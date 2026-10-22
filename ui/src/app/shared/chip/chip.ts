import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

export type ChipTone = 'secondary' | 'surface';

@Component({
  selector: 'button[appChip]',
  template: `<ng-content />`,
  styleUrl: './chip.css',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'app-chip',
    '[attr.data-tone]': 'tone()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chip {
  readonly tone = input<ChipTone>('secondary');
}
