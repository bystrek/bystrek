import { TestBed } from '@angular/core/testing';
import { LitDialogHarness } from './dialog.harness';

// Spike: ekl-dialog's generated wrapper — two-way [(open)] and projected content under Angular.
// Focus, the top layer and assistive-tech behaviour need a real browser (ekierka/lit's tests).
const render = async () => {
  const fixture = TestBed.createComponent(LitDialogHarness);
  const harness = fixture.componentInstance;
  const el: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await settle();
  const dialog = el.querySelector<HTMLElement & { open: boolean }>('ekl-dialog')!;
  const title = () => el.querySelector('[ekl-dialog-title]')!;
  return { harness, el, dialog, title, settle };
};

describe('ekl-dialog (Lit) under Angular', () => {
  it('opens from the model and labels itself with the projected title', async () => {
    const { harness, dialog, title, settle } = await render();
    harness.open.set(true);
    await settle();
    expect(dialog.open).toBe(true);
    await vi.waitFor(() => expect(dialog.getAttribute('aria-labelledby')).toBe(title().id));
    expect(title().id).toBeTruthy();
  });

  it('writes Escape back to the model', async () => {
    const { harness, dialog, settle } = await render();
    harness.open.set(true);
    await settle();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    await vi.waitFor(() => expect(harness.open()).toBe(false));
  });

  it('writes a projected close button back to the model', async () => {
    const { harness, el, settle } = await render();
    harness.open.set(true);
    await settle();
    el.querySelector<HTMLButtonElement>('[ekl-dialog-close]')!.click();
    await settle();
    await vi.waitFor(() => expect(harness.open()).toBe(false));
  });

  it('keeps the parts wired when Angular re-renders them', async () => {
    const { harness, dialog, title, settle } = await render();
    harness.open.set(true);
    await settle();
    harness.title.set('Rename it');
    await settle();
    expect(title().textContent).toBe('Rename it');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title().id);
  });

  it('runs a signal form inside and closes on save', async () => {
    const { harness, el, settle } = await render();
    harness.open.set(true);
    await settle();
    const input = el.querySelector<HTMLInputElement>('ekl-dialog input')!;
    input.value = 'Camelot';
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('ekl-dialog form')!.requestSubmit();
    await settle();
    expect(harness.saved()).toBe('Camelot');
    expect(harness.open()).toBe(false);
  });
});
