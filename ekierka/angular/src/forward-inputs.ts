import { effect, type Signal } from '@angular/core';

/**
 * Copies each signal input onto the custom element's property of the same name. `undefined` is
 * forwarded too, which clears the property; a wrapper's inputs start at the element's own
 * (literal) defaults, so an unset input changes nothing.
 */
export function forwardInputs<T extends object>(
  source: T,
  element: HTMLElement,
  names: readonly (keyof T & string)[],
): void {
  for (const name of names) {
    const read = source[name] as Signal<unknown>;
    effect(() => {
      (element as unknown as Record<string, unknown>)[name] = read();
    });
  }
}
