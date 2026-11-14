import { html, render } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { EklAlert } from './alert.js';

const container = document.createElement('div');
document.body.append(container);
afterEach(() => render(html``, container));

describe('ekl-alert', () => {
  it('renders projected content in the body through a native slot', async () => {
    render(
      html`<ekl-alert heading="Saved" tone="primary"><b>first</b> text</ekl-alert>`,
      container,
    );
    const alert = container.querySelector<EklAlert>('ekl-alert')!;
    await alert.updateComplete;
    const slot = alert.shadowRoot!.querySelector<HTMLSlotElement>('.body slot')!;
    expect(
      slot
        .assignedNodes()
        .map((n) => n.textContent!.trim())
        .filter(Boolean),
    ).toEqual(['first', 'text']);
    await expect.element(page.getByRole('status')).toBeInTheDocument();
    expect(alert.shadowRoot!.querySelector('.heading')!.textContent).toBe('Saved');
  });

  it('is an alert when it is about danger, and announces dismissal', async () => {
    render(html`<ekl-alert heading="Offline" tone="danger"></ekl-alert>`, container);
    const alert = container.querySelector<EklAlert>('ekl-alert')!;
    await alert.updateComplete;
    expect(alert.getAttribute('role')).toBe('alert');
    const dismissed = vi.fn();
    alert.addEventListener('ek-dismiss', dismissed);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    expect(dismissed).toHaveBeenCalledOnce();
  });
});
