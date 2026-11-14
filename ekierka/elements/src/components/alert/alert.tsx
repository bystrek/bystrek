import { Component, Event, type EventEmitter, h, Host, Prop } from '@stencil/core';
import { CHECK_BOLD, INFO_BOLD, WARNING_BOLD, X_BOLD } from '../../icons';

export const AlertTone = {
  DANGER: 'danger',
  PRIMARY: 'primary',
  NEUTRAL: 'neutral',
} as const;

export type AlertTone = (typeof AlertTone)[keyof typeof AlertTone];

const ICON: Record<AlertTone, string> = {
  danger: WARNING_BOLD,
  primary: CHECK_BOLD,
  neutral: INFO_BOLD,
};

/**
 * A boxed message with a heading. The message itself is the default slot, rendered inside the
 * body, so whatever the page projects (and later changes) has to land there.
 */
@Component({
  tag: 'ek-alert',
  styleUrl: 'alert.css',
  scoped: true,
})
export class Alert {
  @Prop() tone: AlertTone = AlertTone.NEUTRAL;

  @Prop() heading!: string;

  @Prop() dismissible = true;

  /** Fired when the dismiss button is pressed. The page decides whether the alert goes away. */
  @Event() ekDismiss!: EventEmitter<void>;

  render() {
    return (
      <Host role={this.tone === AlertTone.DANGER ? 'alert' : 'status'} data-tone={this.tone}>
        <div class="head">
          <span class="icon" aria-hidden="true" innerHTML={ICON[this.tone]} />
          <strong class="heading">{this.heading}</strong>
          {this.dismissible && (
            <button
              type="button"
              class="dismiss"
              aria-label="Dismiss"
              onClick={() => this.ekDismiss.emit()}
            >
              <span class="icon" aria-hidden="true" innerHTML={X_BOLD} />
            </button>
          )}
        </div>
        <div class="body">
          <slot />
        </div>
      </Host>
    );
  }
}
