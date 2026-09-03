import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-status-banner',
  imports: [Icon],
  template: `
    @if (message()) {
      <div class="status" [id]="elementId()" [class.error]="error()">
        @if (error()) {
          <app-icon name="square-alert" />
        }
        <span>{{ message() }}</span>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBanner {
  readonly message = input.required<string>();
  readonly error = input(false);
  readonly elementId = input<string>();
}
