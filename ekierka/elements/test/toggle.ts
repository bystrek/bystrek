import { createMachine } from '@zag-js/core';
import { css, html, LitElement } from 'lit';
import { adoptStyles, spread, ZagController } from '../src/index.js';

// A one-button toggle on a real Zag machine: it exercises the controller, `spread` and the
// light-DOM style adoption together, the way a real element will.
const machine = createMachine<{
  props: { pressed?: boolean };
  state: 'off' | 'on';
  event: { type: 'TOGGLE' };
}>({
  initialState: ({ prop }) => (prop('pressed') ? 'on' : 'off'),
  states: {
    off: { on: { TOGGLE: { target: 'on' } } },
    on: { on: { TOGGLE: { target: 'off' } } },
  },
});

const styles = css`
  ek-test-toggle button {
    outline: 2px solid rgb(1, 2, 3);
  }
`;

export class EkTestToggle extends LitElement {
  static override properties = { pressed: { type: Boolean } };
  pressed = false;

  private readonly zag = new ZagController(this, machine, () => ({ pressed: this.pressed }));

  protected override createRenderRoot() {
    return this; // light DOM
  }

  override connectedCallback() {
    super.connectedCallback();
    adoptStyles(this, styles);
  }

  override render() {
    const api = this.zag.connect((service, normalize) => ({
      on: service.state.matches('on'),
      props: normalize.element({
        'aria-pressed': service.state.matches('on'),
        onClick: () => service.send({ type: 'TOGGLE' }),
      }),
    }));
    return api ? html`<button type="button" ${spread(api.props)}>toggle</button>` : html``;
  }
}
customElements.define('ek-test-toggle', EkTestToggle);
