import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StackDirection = 'vertical' | 'horizontal';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackGap = 'space-1' | 'space-2' | 'space-3' | 'space-4' | 'space-6';

@Component({
  selector: 'app-stack',
  template: `<ng-content />`,
  styleUrl: './stack.css',
  host: {
    '[attr.data-direction]': 'direction()',
    '[attr.data-align]': 'align()',
    '[style.gap]': 'gapValue()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stack {
  readonly direction = input<StackDirection>('vertical');
  readonly align = input<StackAlign>('stretch');
  readonly gap = input<StackGap>('space-3');
  protected readonly gapValue = computed(() => `var(--${this.gap()})`);
}
