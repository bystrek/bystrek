import { TestBed } from '@angular/core/testing';
import { AlertSlotsHarness } from './alert-slots.harness';

// Spike: Stencil's scoped-mode slot emulation under Angular's DOM updates.
const render = async () => {
  const fixture = TestBed.createComponent(AlertSlotsHarness);
  const harness = fixture.componentInstance;
  const el: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const alert = () => el.querySelector('ek-alert');
  // What ends up inside the element's body, in DOM order.
  const body = () =>
    [...(alert()?.querySelectorAll('.body > .slotted') ?? [])].map((n) => n.textContent!.trim());
  // Projected nodes that escaped the body (e.g. left at the host's root).
  const strays = () =>
    [...(alert()?.children ?? [])].filter((n) => n.classList.contains('slotted'));
  await settle();
  await vi.waitFor(() => {
    if (!alert()?.querySelector('.body')) throw new Error('ek-alert not rendered yet');
  });
  return { harness, el, settle, body, strays, alert };
};

describe('ek-alert slot under Angular', () => {
  it('renders the projected content inside the body, in order', async () => {
    const { body, strays } = await render();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
    expect(strays()).toEqual([]);
  });

  it('inserts and removes an @if block at the start', async () => {
    const { harness, settle, body, strays } = await render();
    harness.first.set(true);
    await settle();
    expect(body()).toEqual(['first', 'text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
    harness.first.set(false);
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
    expect(strays()).toEqual([]);
  });

  it('updates interpolated text in place', async () => {
    const { harness, settle, body } = await render();
    harness.text.set('changed');
    await settle();
    expect(body()[0]).toBe('changed');
  });

  it('adds, removes and reorders @for items', async () => {
    const { harness, settle, body, strays } = await render();
    harness.items.set(['item 1', 'item 2', 'item 3']);
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'item 3', 'mode a', 'clicked 0']);
    harness.items.set(['item 3', 'item 1']);
    await settle();
    expect(body()).toEqual(['text', 'item 3', 'item 1', 'mode a', 'clicked 0']);
    harness.items.set([]);
    await settle();
    expect(body()).toEqual(['text', 'mode a', 'clicked 0']);
    expect(strays()).toEqual([]);
  });

  it('swaps @switch cases in place', async () => {
    const { harness, settle, body } = await render();
    harness.mode.set('b');
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode b', 'clicked 0']);
    harness.mode.set('a');
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
  });

  it('keeps Angular bindings on projected elements working', async () => {
    const { settle, body, alert } = await render();
    alert()!.querySelector<HTMLButtonElement>('button.slotted')!.click();
    await settle();
    expect(body().at(-1)).toBe('clicked 1');
  });

  it('survives being destroyed and created again', async () => {
    const { harness, settle, body, alert } = await render();
    harness.alert.set(false);
    await settle();
    expect(alert()).toBeNull();
    harness.alert.set(true);
    await settle();
    await vi.waitFor(() =>
      expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']),
    );
  });

  it('keeps bare projected text inside the body and updates it', async () => {
    const { harness, settle, alert } = await render();
    const bodyText = () =>
      alert()!.querySelector('.body')!.textContent!.replace(/\s+/g, ' ').trim();
    // Text nodes left directly under the host would render outside the box's body.
    const strayText = () =>
      [...alert()!.childNodes].filter(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
      );
    expect(bodyText()).toMatch(/clicked 0 bare text$/);
    harness.bare.set('changed bare');
    await settle();
    expect(bodyText()).toMatch(/clicked 0 changed bare$/);
    expect(strayText()).toEqual([]);
  });

  it('emits ekDismiss through the wrapper output', async () => {
    const { settle, alert } = await render();
    alert()!.querySelector<HTMLButtonElement>('button.dismiss')!.click();
    await settle();
    expect(alert()).toBeNull();
  });
});
