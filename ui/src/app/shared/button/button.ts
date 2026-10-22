import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  ElementRef,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';

export type ButtonVariant = 'surface' | 'primary' | 'inverse';
export type ButtonShape = 'default' | 'icon';

/*
 * Wraps a native <button> or <a>. Disabled anchors use aria-disabled="true".
 * Quiet mode: an ancestor with [data-quiet] drops the shadow (see styles.css).
 */
@Component({
  selector: 'button[appButton], a[appButton]',
  template: `<ng-content />`,
  styleUrl: './button.css',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'app-button',
    '[attr.data-variant]': 'variant()',
    '[attr.data-shape]': 'shape()',
    '[attr.data-block]': 'block() ? "" : null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  readonly variant = input<ButtonVariant>('surface');
  readonly shape = input<ButtonShape>('default');
  readonly block = input(false, { transform: booleanAttribute });

  constructor() {
    // Registered in the constructor so it runs before click handlers bound in the parent template.
    const el: HTMLElement = inject(ElementRef).nativeElement;
    el.addEventListener('click', (event) => {
      if (el.tagName === 'A' && el.getAttribute('aria-disabled') === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
  }
}
