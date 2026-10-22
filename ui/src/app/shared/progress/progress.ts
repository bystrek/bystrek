import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress',
  template: `<span class="fill" [style.width.%]="percent()"></span>`,
  styleUrl: './progress.css',
  host: {
    role: 'progressbar',
    '[attr.aria-label]': 'label()',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'percent()',
    '[attr.data-indeterminate]': 'percent() === null ? "" : null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  readonly label = input.required<string>();
  /** 0-100. Leave unset for indeterminate. */
  readonly value = input<number>();

  protected readonly percent = computed(() => {
    const value = this.value();
    return value === undefined ? null : Math.min(100, Math.max(0, value));
  });
}
