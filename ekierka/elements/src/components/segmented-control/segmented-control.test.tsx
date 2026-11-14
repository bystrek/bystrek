import { h, render } from '@stencil/vitest';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

const OPTIONS = [
  { value: 'ask', label: 'Ask' },
  { value: 'log', label: 'Log' },
];

const mount = async (props: { value?: string; disabled?: boolean } = {}) => {
  const { root } = await render(
    <div>
      <button>before</button>
      <ek-segmented-control label="Bar mode" options={OPTIONS} {...props} />
      <button>after</button>
    </div>,
  );
  const control = root.querySelector('ek-segmented-control')!;
  const change = vi.fn();
  control.addEventListener('ekValueChange', (e) => change(e.detail));
  root.querySelector('button')!.focus();
  return { control, change };
};

const radio = (name: string) => page.getByRole('radio', { name });

describe('ek-segmented-control', () => {
  it('names the group and each option through light-DOM ids', async () => {
    await mount({ value: 'ask' });
    await expect.element(page.getByRole('radiogroup', { name: 'Bar mode' })).toBeVisible();
    await expect.element(radio('Ask')).toBeChecked();
    await expect.element(radio('Log')).not.toBeChecked();
  });

  it('is one tab stop that lands on the selected option', async () => {
    await mount({ value: 'log' });
    await userEvent.tab();
    await expect.element(radio('Log')).toHaveFocus();
    await userEvent.tab();
    await expect.element(page.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('moves and selects with the arrow keys', async () => {
    const { control, change } = await mount({ value: 'ask' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(radio('Log')).toBeChecked();
    await expect.element(radio('Log')).toHaveFocus();
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith({ value: 'log' }));
    expect(control.value).toBe('log');

    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(radio('Ask')).toBeChecked();
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith({ value: 'ask' }));
  });

  it('marks the keyboard-focused option for the focus ring', async () => {
    await mount({ value: 'ask' });
    await userEvent.tab();
    await vi.waitFor(() =>
      expect(radio('Ask').element().closest('label')!.hasAttribute('data-focus-visible')).toBe(
        true,
      ),
    );
  });

  it('is skipped by Tab and ignores clicks while disabled', async () => {
    const { change } = await mount({ value: 'ask', disabled: true });
    await expect.element(radio('Log')).toBeDisabled();
    await expect.element(page.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    await expect.element(page.getByRole('button', { name: 'after' })).toHaveFocus();
    await page.getByText('Log').click({ force: true });
    await expect.element(radio('Ask')).toBeChecked();
    expect(change).not.toHaveBeenCalled();
  });
});
