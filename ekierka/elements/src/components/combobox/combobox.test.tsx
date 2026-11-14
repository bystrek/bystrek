import { h, render } from '@stencil/vitest';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

const OPTIONS = [
  { value: 'health', label: 'Health' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
];

const mount = async (props: { value?: string; disabled?: boolean } = {}) => {
  // The overflow-hidden, transformed box would clip or misplace a list that isn't in the top layer.
  const { root } = await render(
    <div
      style={{ overflow: 'hidden', height: '120px', padding: '24px', transform: 'translateZ(0)' }}
    >
      <button>before</button>
      <ek-combobox label="Category" options={OPTIONS} {...props} />
    </div>,
  );
  const control = root.querySelector('ek-combobox')!;
  const change = vi.fn();
  control.addEventListener('ekValueChange', (e) => change(e.detail));
  return { root, control, change };
};

const input = () => page.getByRole('combobox', { name: 'Category' });
const listbox = () => page.getByRole('listbox');
const option = (name: string) => page.getByRole('option', { name });

describe('ek-combobox', () => {
  it('names the input and wires it to the listbox', async () => {
    await mount();
    await userEvent.click(input());
    await expect.element(listbox()).toBeVisible();
    const el = input().element() as HTMLInputElement;
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(el.getAttribute('aria-controls')!)).toBe(listbox().element());
  });

  it('moves the highlight with the arrow keys while focus stays on the input', async () => {
    await mount();
    await userEvent.click(input());
    await userEvent.keyboard('{ArrowDown}');
    const el = input().element() as HTMLInputElement;
    await vi.waitFor(() =>
      expect(document.getElementById(el.getAttribute('aria-activedescendant')!)?.textContent).toBe(
        'Health',
      ),
    );
    await userEvent.keyboard('{ArrowDown}');
    await vi.waitFor(() =>
      expect(document.getElementById(el.getAttribute('aria-activedescendant')!)?.textContent).toBe(
        'Home',
      ),
    );
    await expect.element(input()).toHaveFocus();
  });

  it('picks the highlighted option with Enter', async () => {
    const { control, change } = await mount();
    await userEvent.click(input());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith({ value: 'home' }));
    expect(control.value).toBe('home');
    await expect.element(input()).toHaveValue('Home');
    await expect.element(listbox()).not.toBeInTheDocument();
  });

  it('filters as you type', async () => {
    await mount();
    await userEvent.click(input());
    await userEvent.keyboard('wo');
    await expect.element(option('Work')).toBeVisible();
    await expect.element(option('Health')).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click outside', async () => {
    await mount();
    await userEvent.click(input());
    await expect.element(listbox()).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(listbox()).not.toBeInTheDocument();
    await userEvent.click(input());
    await expect.element(listbox()).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'before' }));
    await expect.element(listbox()).not.toBeInTheDocument();
  });

  it('opens in the top layer, under the input, unclipped by its ancestors', async () => {
    await mount();
    await userEvent.click(input());
    await expect.element(listbox()).toBeVisible();
    const positioner = listbox().element().parentElement!;
    expect(positioner.matches(':popover-open')).toBe(true);
    const inputBox = input().element().closest('.control')!.getBoundingClientRect();
    const listBox = listbox().element().getBoundingClientRect();
    expect(Math.abs(listBox.left - inputBox.left)).toBeLessThan(1);
    expect(listBox.top).toBeGreaterThanOrEqual(inputBox.bottom);
    // The whole list is hit-testable, past the 120px clipping box.
    const x = listBox.left + 10;
    const y = listBox.bottom - 10;
    expect(document.elementFromPoint(x, y)?.closest('[role="option"]')?.textContent).toBe('Work');
  });

  it('keeps working when the options change while it is open', async () => {
    const { control } = await mount();
    await userEvent.click(input());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    control.options = [
      { value: 'diet', label: 'Diet' },
      ...OPTIONS.filter((o) => o.value !== 'health'),
    ];
    await expect.element(option('Diet')).toBeVisible();
    await expect.element(option('Health')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');
    const el = input().element() as HTMLInputElement;
    await vi.waitFor(() =>
      expect(document.getElementById(el.getAttribute('aria-activedescendant')!)).not.toBeNull(),
    );
  });

  it('shows the label of a value set from outside', async () => {
    const { control } = await mount({ value: 'work' });
    await expect.element(input()).toHaveValue('Work');
    control.value = 'health';
    await expect.element(input()).toHaveValue('Health');
  });

  it('ignores the keyboard and mouse while disabled', async () => {
    await mount({ disabled: true });
    await expect.element(input()).toBeDisabled();
    await userEvent.click(input(), { force: true });
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(listbox()).not.toBeInTheDocument();
  });
});
