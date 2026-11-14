import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { CHECK_BOLD, INFO_BOLD, WARNING_BOLD, X_BOLD } from '../icons.js';

export const AlertTone = {
  DANGER: 'danger',
  PRIMARY: 'primary',
  NEUTRAL: 'neutral',
} as const;

export type AlertTone = (typeof AlertTone)[keyof typeof AlertTone];

const ICON = { danger: WARNING_BOLD, primary: CHECK_BOLD, neutral: INFO_BOLD };

/**
 * A boxed message with a heading. The message is the default slot, rendered inside the body.
 * Shadow DOM with a native `<slot>`: nothing inside needs an id reference to projected content.
 *
 * @tagname ekl-alert
 * @fires {CustomEvent<void>} ek-dismiss - The dismiss button was pressed. The page decides whether the alert goes away.
 * @slot - The message.
 */
export class EklAlert extends LitElement {
  static override styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      padding: var(--space-4);
      background: var(--color-surface);
      color: var(--color-ink);
      border: var(--border-heavy);
      box-shadow: var(--shadow);
    }

    :host([tone='primary']) {
      background: var(--color-primary);
    }

    :host([tone='danger']) {
      background: var(--color-danger);
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .icon {
      display: inline-flex;
      width: 1em;
      height: 1em;
      font-size: var(--text-xl);
    }

    .icon svg {
      width: 100%;
      height: 100%;
    }

    .heading {
      flex: 1;
      min-width: 0;
      font: 700 var(--text-md) / 1.2 var(--font-mono);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
    }

    .dismiss {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--tap);
      height: var(--tap);
      margin: 0;
      padding: 0;
      border: var(--border-heavy);
      background: var(--color-surface);
      color: var(--color-ink);
      box-shadow: var(--shadow-sm);
      cursor: pointer;
    }

    .dismiss .icon {
      font-size: var(--text-lg);
    }

    .dismiss:focus-visible {
      outline: var(--focus-ring);
      outline-offset: var(--focus-offset);
    }

    .body {
      margin-top: var(--space-2);
      font: 500 var(--text-md) / 1.4 var(--font-ui);
    }
  `;

  @property({ reflect: true }) tone: AlertTone = AlertTone.NEUTRAL;

  @property() heading = '';

  @property({ type: Boolean }) dismissible = true;

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('tone')) this.setAttribute('role', this.tone === 'danger' ? 'alert' : 'status');
  }

  protected override render() {
    return html`
      <div class="head">
        <span class="icon" aria-hidden="true">${ICON[this.tone]}</span>
        <strong class="heading">${this.heading}</strong>
        ${
          this.dismissible
            ? html`<button
                type="button"
                class="dismiss"
                aria-label="Dismiss"
                @click=${() => this.dispatchEvent(new CustomEvent('ek-dismiss', { bubbles: true }))}
              >
                <span class="icon" aria-hidden="true">${X_BOLD}</span>
              </button>`
            : nothing
        }
      </div>
      <div class="body"><slot></slot></div>
    `;
  }
}

export const defineEklAlert = () =>
  customElements.get('ekl-alert') ?? customElements.define('ekl-alert', EklAlert);
