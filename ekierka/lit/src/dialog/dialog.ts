import * as dialog from '@zag-js/dialog';
import { spreadProps } from '@zag-js/vanilla';
import { css, LitElement, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { adoptDocumentStyles } from '../styles.js';
import { ZagController } from '../zag/zag-controller.js';

export interface DialogOpenChange {
  open: boolean;
}

const styles = css`
  @scope (ekl-dialog) {
    :scope {
      box-sizing: border-box;
      width: min(calc(100vw - 2 * var(--space-4)), 480px);
      max-height: calc(100dvh - 2 * var(--space-4));
      overflow: auto;
      padding: var(--space-6);
      border: var(--border-heavy);
      background: var(--color-surface);
      color: var(--color-ink);
      box-shadow: var(--shadow);
    }

    :scope:focus-visible {
      outline: var(--focus-ring);
      outline-offset: var(--focus-offset);
    }
  }

  ekl-dialog::backdrop {
    background: color-mix(in srgb, var(--color-ink), transparent 50%);
  }
`;

// The parts the page marks on the children it projects.
const PART = {
  title: '[ekl-dialog-title]',
  description: '[ekl-dialog-description]',
  closeTrigger: '[ekl-dialog-close]',
} as const;

let instances = 0;

/**
 * A modal dialog that renders no markup of its own: the element *is* the dialog, and the page
 * projects its content, marking the title (`ekl-dialog-title`), the description
 * (`ekl-dialog-description`) and any close buttons (`ekl-dialog-close`). Everything stays in one
 * DOM tree, so `aria-labelledby` and `aria-describedby` resolve. It opens in the top layer
 * (the popover API), with `::backdrop` as the overlay; Zag traps focus, closes on Escape or a
 * click outside, hides the rest of the page from assistive tech and restores focus on close.
 *
 * @tagname ekl-dialog
 * @fires {CustomEvent<DialogOpenChange>} ek-open-change - The user opened or closed the dialog. `open` is updated by then.
 */
export class EklDialog extends LitElement {
  /** Whether the dialog is open. */
  @property({ type: Boolean }) open = false;

  /** Makes it an `alertdialog`: it interrupts with something that needs a response. */
  @property({ type: Boolean }) alert = false;

  /**
   * Where focus goes when the dialog closes. Defaults to whatever had focus when it opened, but
   * Safari doesn't focus a button on click, so pass the trigger to be sure.
   */
  @property({ attribute: false }) returnFocus: HTMLElement | null = null;

  private readonly machineId = `ekl-dialog-${++instances}`;
  // spreadProps diffs against what it applied last time, so each part keeps its entry until the
  // element leaves; cleaning up on every update would leave stale attributes behind.
  private readonly spread = new Map<Element, () => void>();
  private readonly children$ = new MutationObserver(() => this.requestUpdate());

  private readonly zag = new ZagController(this, dialog.machine, () => ({
    id: this.machineId,
    open: this.open,
    role: this.alert ? ('alertdialog' as const) : ('dialog' as const),
    finalFocusEl: this.returnFocus ? () => this.returnFocus : undefined,
    onOpenChange: ({ open }) => {
      this.open = open;
      this.dispatchEvent(
        new CustomEvent<DialogOpenChange>('ek-open-change', { detail: { open }, bubbles: true }),
      );
    },
  }));

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute('popover', 'manual');
    // Projected children come and go (Angular's @if); re-apply the parts when they do.
    this.children$.observe(this, { childList: true, subtree: true });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.children$.disconnect();
    this.spread.forEach((cleanup) => cleanup());
    this.spread.clear();
  }

  protected override createRenderRoot() {
    adoptDocumentStyles(styles);
    return this;
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.size) this.zag.refresh();
  }

  protected override render() {
    return nothing;
  }

  protected override updated() {
    const api = this.zag.connect(dialog.connect);
    if (!api) return;
    // Top layer first, so the content is visible by the time Zag moves focus into it.
    if ('togglePopover' in this && api.open !== this.matches(':popover-open')) {
      this.togglePopover(api.open);
    }
    const parts: [Element, Record<string, unknown>][] = [[this, api.getContentProps()]];
    for (const [selector, props] of [
      [PART.title, api.getTitleProps()],
      [PART.description, api.getDescriptionProps()],
      [PART.closeTrigger, api.getCloseTriggerProps()],
    ] as const) {
      for (const el of this.querySelectorAll(selector)) parts.push([el, props]);
    }
    const current = new Set(parts.map(([el]) => el));
    for (const [el, cleanup] of this.spread) {
      if (!current.has(el)) {
        cleanup();
        this.spread.delete(el);
      }
    }
    for (const [el, props] of parts) this.spread.set(el, spreadProps(el, props));
  }
}

export const defineEklDialog = () =>
  customElements.get('ekl-dialog') ?? customElements.define('ekl-dialog', EklDialog);
