import { html, render } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { EklDialog } from './dialog.js';

const container = document.createElement('div');
document.body.append(container);
afterEach(() => render(html``, container));

const mount = async ({ alert = true } = {}) => {
  // The overflow-hidden, transformed box would clip or misplace a dialog not in the top layer.
  render(
    html`<button id="trigger">Delete place</button>
      <div style="overflow:hidden;height:80px;transform:translateZ(0)">
        <ekl-dialog ?alert=${alert}>
          <h2 ekl-dialog-title>Delete place?</h2>
          <p ekl-dialog-description>This can't be undone.</p>
          <label>Type the name <input name="confirm" /></label>
          <button ekl-dialog-close>Cancel</button>
          <button>Delete</button>
        </ekl-dialog>
      </div>`,
    container,
  );
  const dialog = container.querySelector<EklDialog>('ekl-dialog')!;
  await dialog.updateComplete;
  const changes = vi.fn();
  dialog.addEventListener('ek-open-change', (e) => changes((e as CustomEvent).detail));
  const trigger = page.getByRole('button', { name: 'Delete place' });
  const open = async () => {
    await userEvent.click(trigger);
    dialog.open = true;
    await expect.element(page.getByRole(alert ? 'alertdialog' : 'dialog')).toBeVisible();
  };
  return { dialog, changes, trigger, open };
};

const dialogRole = () => page.getByRole('alertdialog', { name: 'Delete place?' });

describe('ekl-dialog (behaviour-only, light DOM)', () => {
  it('is named and described by the projected title and description', async () => {
    const { open } = await mount();
    await open();
    await expect.element(dialogRole()).toBeVisible();
    await expect.element(dialogRole()).toHaveAccessibleDescription("This can't be undone.");
    expect(dialogRole().element().getAttribute('aria-modal')).toBe('true');
  });

  it('moves focus to the least destructive action, and Tab stays inside', async () => {
    const { open } = await mount();
    await open();
    // An alertdialog starts on its close button (WAI-ARIA's alert dialog pattern).
    await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toHaveFocus();
    await userEvent.tab();
    await expect.element(page.getByRole('textbox')).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toHaveFocus();
  });

  it('closes on Escape, reports it, and returns focus to the trigger', async () => {
    const { dialog, changes, trigger, open } = await mount();
    await open();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
    expect(dialog.open).toBe(false);
    expect(changes).toHaveBeenLastCalledWith({ open: false });
    await expect.element(trigger).toHaveFocus();
  });

  it('closes from a projected close button', async () => {
    const { dialog, open } = await mount();
    await open();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(dialog.matches(':popover-open')).toBe(false);
  });

  it('closes on a click outside, unless it is an alert dialog', async () => {
    const { dialog, open } = await mount({ alert: false });
    await open();
    // Beside the dialog: the backdrop.
    await userEvent.click(dialog, { position: { x: -20, y: 10 }, force: true });
    await vi.waitFor(() => expect(dialog.open).toBe(false));

    const alert = await mount({ alert: true });
    await alert.open();
    await userEvent.click(alert.dialog, { position: { x: -20, y: 10 }, force: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(alert.dialog.open).toBe(true);
  });

  it('opens in the top layer, centred, unclipped by its ancestors', async () => {
    const { dialog, open } = await mount();
    await open();
    expect(dialog.matches(':popover-open')).toBe(true);
    const box = dialog.getBoundingClientRect();
    expect(Math.abs(box.left + box.width / 2 - innerWidth / 2)).toBeLessThan(2);
    const hit = document.elementFromPoint(box.left + 20, box.bottom - 20);
    expect(dialog.contains(hit)).toBe(true);
  });

  it('hides the rest of the page from assistive tech while open', async () => {
    const { open } = await mount();
    await open();
    await expect
      .element(page.getByRole('button', { name: 'Delete place' }))
      .not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('button', { name: 'Delete place' })).toBeInTheDocument();
  });

  it('drops aria-describedby when there is no description', async () => {
    render(
      html`<ekl-dialog
        ><h2 ekl-dialog-title>Rename</h2>
        <button>Save</button></ekl-dialog
      >`,
      container,
    );
    const dialog = container.querySelector<EklDialog>('ekl-dialog')!;
    dialog.open = true;
    await expect.element(page.getByRole('dialog', { name: 'Rename' })).toBeVisible();
    await vi.waitFor(() => expect(dialog.hasAttribute('aria-describedby')).toBe(false));
  });

  it('returns focus to returnFocus, even when the trigger never had focus (Safari clicks)', async () => {
    const { dialog } = await mount({ alert: false });
    const trigger = container.querySelector<HTMLButtonElement>('#trigger')!;
    dialog.returnFocus = trigger;
    (document.activeElement as HTMLElement | null)?.blur();
    dialog.open = true;
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('button', { name: 'Delete place' })).toHaveFocus();
  });
});
