import { effect, type Signal } from '@angular/core';

/**
 * Copies each signal input onto the custom element's property of the same name. `undefined` is
 * skipped, so an unset input leaves the element's own default alone.
 */
export function forwardInputs<T extends object>(
  source: T,
  element: HTMLElement,
  names: readonly (keyof T & string)[],
): void {
  for (const name of names) {
    const read = source[name] as Signal<unknown>;
    effect(() => {
      const value = read();
      if (value !== undefined) (element as unknown as Record<string, unknown>)[name] = value;
    });
  }
}
