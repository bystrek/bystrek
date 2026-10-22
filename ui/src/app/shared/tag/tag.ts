import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

export type TagVariant = 'solid' | 'outline' | 'boxed';

@Component({
  selector: 'app-tag',
  imports: [Icon],
  template: `
    @if (icon(); as name) {
      <app-icon [name]="name" />
    }
    <ng-content />
  `,
  styleUrl: './tag.css',
  host: { '[attr.data-variant]': 'variant()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tag {
  readonly variant = input<TagVariant>('solid');
  readonly icon = input<IconName>();
}
