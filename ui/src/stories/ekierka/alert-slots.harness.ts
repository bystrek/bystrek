import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { EkAlert } from '@ekierka/angular';

// Spike harness: everything Angular can do to projected content, aimed at ek-alert's default
// slot, which sits inside the element's body (not at its root).
@Component({
  selector: 'app-alert-slots-harness',
  imports: [EkAlert],
  template: `
    @if (alert()) {
      <ek-alert heading="Slots" tone="primary" (ekDismiss)="alert.set(false)">
        @if (first()) {
          <b class="slotted">first</b>
        }
        <span class="slotted">{{ text() }}</span>
        @for (item of items(); track item) {
          <i class="slotted">{{ item }}</i>
        }
        @switch (mode()) {
          @case ('a') {
            <em class="slotted">mode a</em>
          }
          @case ('b') {
            <strong class="slotted">mode b</strong>
          }
        }
        <button type="button" class="slotted" (click)="clicks.set(clicks() + 1)">
          clicked {{ clicks() }}
        </button>
        {{ bare() }}
      </ek-alert>
    }
    <div class="controls" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
      <button type="button" (click)="first.set(!first())">toggle first</button>
      <button type="button" (click)="text.set(text() + '!')">change text</button>
      <button type="button" (click)="items.set([...items(), 'item ' + (items().length + 1)])">
        add item
      </button>
      <button type="button" (click)="items.set(items().slice(1))">remove first item</button>
      <button type="button" (click)="items.set(items().slice().reverse())">reverse items</button>
      <button type="button" (click)="bare.set(bare() + '?')">change bare text</button>
      <button type="button" (click)="mode.set(mode() === 'a' ? 'b' : 'a')">switch mode</button>
      <button type="button" (click)="alert.set(!alert())">toggle alert</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertSlotsHarness {
  readonly alert = signal(true);
  readonly first = signal(false);
  readonly text = signal('text');
  readonly items = signal(['item 1', 'item 2']);
  readonly mode = signal<'a' | 'b'>('a');
  readonly clicks = signal(0);
  readonly bare = signal('bare text');
}
