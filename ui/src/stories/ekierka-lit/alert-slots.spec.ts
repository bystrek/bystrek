import { TestBed } from '@angular/core/testing';
import { LitAlertSlotsHarness } from './alert-slots.harness';

// Spike: a native shadow-DOM <slot> (Lit) under Angular's DOM updates. Projected nodes stay
// children of the host; the slot decides where they render.
const render = async () => {
  const fixture = TestBed.createComponent(LitAlertSlotsHarness);
  const harness = fixture.componentInstance;
  const el: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const alert = () => el.querySelector('ekl-alert');
  const slot = () => alert()?.shadowRoot?.querySelector<HTMLSlotElement>('.body slot');
  // What the body's slot renders, in order.
  const body = () =>
    (slot()?.assignedElements() ?? [])
      .filter((n) => n.classList.contains('slotted'))
      .map((n) => n.textContent!.trim());
  await settle();
  await vi.waitFor(() => {
    if (!slot()) throw new Error('ekl-alert not rendered yet');
  });
  return { harness, el, settle, body, slot, alert };
};

describe('ekl-alert (Lit) slot under Angular', () => {
  it('renders the projected content through the body slot, in order', async () => {
    const { body } = await render();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
  });

  it('inserts and removes an @if block at the start', async () => {
    const { harness, settle, body } = await render();
    harness.first.set(true);
    await settle();
    expect(body()).toEqual(['first', 'text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
    harness.first.set(false);
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode a', 'clicked 0']);
  });

  it('updates interpolated text in place', async () => {
    const { harness, settle, body } = await render();
    harness.text.set('changed');
    await settle();
    expect(body()[0]).toBe('changed');
  });

  it('adds, removes and reorders @for items', async () => {
    const { harness, settle, body } = await render();
    harness.items.set(['item 1', 'item 2', 'item 3']);
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'item 3', 'mode a', 'clicked 0']);
    harness.items.set(['item 3', 'item 1']);
    await settle();
    expect(body()).toEqual(['text', 'item 3', 'item 1', 'mode a', 'clicked 0']);
    harness.items.set([]);
    await settle();
    expect(body()).toEqual(['text', 'mode a', 'clicked 0']);
  });

  it('swaps @switch cases in place', async () => {
    const { harness, settle, body } = await render();
    harness.mode.set('b');
    await settle();
    expect(body()).toEqual(['text', 'item 1', 'item 2', 'mode b', 'clicked 0']);
  });

  it('keeps Angular bindings on projected elements working', async () => {
    const { settle, body, alert } = await render();
    alert()!.querySelector<HTMLButtonElement>('button.slotted')!.click();
    await settle();
    expect(body().at(-1)).toBe('clicked 1');
  });

  it('keeps bare projected text in the slot and updates it', async () => {
    const { harness, settle, slot } = await render();
    const slotText = () =>
      slot()!
        .assignedNodes()
        .map((n) => n.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    expect(slotText()).toMatch(/clicked 0 bare text$/);
    harness.bare.set('changed bare');
    await settle();
    expect(slotText()).toMatch(/clicked 0 changed bare$/);
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

  it('emits ekDismiss through the generated output', async () => {
    const { settle, alert } = await render();
    alert()!.shadowRoot!.querySelector<HTMLButtonElement>('button.dismiss')!.click();
    await settle();
    expect(alert()).toBeNull();
  });
});
