import { Directive, effect, ElementRef, inject, model, output } from '@angular/core';

type ValueElement = HTMLElement & { value: string | null };

/**
 * Makes an Ekierka form element a signal-forms custom control. A `value` model is what
 * `[formField]` looks for; it then pushes the rest of the field state (`disabled`, `invalid`,
 * `required`, `name`) to every directive on the element with a matching input, which includes
 * the generated wrapper, so only the value and touch need wiring here.
 */
@Directive({
  selector: 'ek-combobox[formField], ek-segmented-control[formField]',
  host: { '(ekValueChange)': 'onValueChange($event)', '(focusout)': 'touch.emit()' },
})
export class EkFormControl {
  readonly value = model<string | null>(null);
  readonly touch = output<void>();

  private readonly element = inject<ElementRef<ValueElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => (this.element.value = this.value()));
  }

  protected onValueChange(event: Event) {
    this.value.set((event as CustomEvent<{ value: string | null }>).detail.value);
  }
}
