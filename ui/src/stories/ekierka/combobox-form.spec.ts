import { TestBed } from '@angular/core/testing';
import { ComboboxFormHarness } from './combobox-form.harness';

// Spike: ek-combobox through the generated wrapper plus EkFormControl, bound with [formField].
const render = async () => {
  const fixture = TestBed.createComponent(ComboboxFormHarness);
  const harness = fixture.componentInstance;
  const el: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const input = await vi.waitFor(() => {
    const found = el.querySelector<HTMLInputElement>('ek-combobox input');
    if (!found) throw new Error('ek-combobox not rendered yet');
    return found;
  });
  const key = async (key: string) => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await settle();
  };
  const options = () => [...el.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  return { harness, el, input, key, settle, options };
};

describe('ek-combobox with a signal form field', () => {
  it('shows the label of the field value', async () => {
    const { harness, input, settle } = await render();
    harness.model.set({ category: 'work' });
    await settle();
    await vi.waitFor(() => expect(input.value).toBe('Work'));
  });

  // Keyboard behaviour itself is covered by ekierka/elements' browser tests.
  it('writes the picked option to the field', async () => {
    const { harness, el, key, settle } = await render();
    await key('ArrowDown');
    [...el.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((o) => o.textContent === 'Home')!
      .click();
    await settle();
    expect(harness.model().category).toBe('home');
  });

  it('follows the options while open', async () => {
    const { harness, key, settle, options } = await render();
    await key('ArrowDown');
    harness.propose();
    harness.existing.set(harness.existing().slice(1));
    await settle();
    await vi.waitFor(() => expect(options()).toEqual(['Home', 'Work', 'New 1 (new)']));
  });

  it('is disabled by the form rule', async () => {
    const { harness, input, settle } = await render();
    harness.locked.set(true);
    await settle();
    await vi.waitFor(() => expect(input.disabled).toBe(true));
    harness.locked.set(false);
    await settle();
    await vi.waitFor(() => expect(input.disabled).toBe(false));
  });

  it('shows the required rule and its failure on the input', async () => {
    const { harness, input, settle } = await render();
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    harness.mustPick.set(true);
    await settle();
    await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    expect(input.required).toBe(true);
    harness.model.set({ category: 'home' });
    await settle();
    await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).not.toBe('true'));
  });

  it('marks the field touched when focus leaves the element', async () => {
    const { harness, input, settle } = await render();
    expect(harness.draft.category().touched()).toBe(false);
    input.focus();
    input.blur();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle();
    expect(harness.draft.category().touched()).toBe(true);
  });

  it('clears to no selection, not an empty-string value', async () => {
    const { harness, el, input, settle } = await render();
    harness.model.set({ category: 'work' });
    await settle();
    await vi.waitFor(() => expect(input.value).toBe('Work'));
    harness.model.set({ category: null });
    await settle();
    const combobox = el.querySelector<HTMLElement & { value: unknown }>('ek-combobox')!;
    expect(combobox.value).toBeNull();
  });
});
