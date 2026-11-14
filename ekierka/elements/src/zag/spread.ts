import { spreadProps } from '@zag-js/vanilla';
import { nothing, type ElementPart } from 'lit';
import { AsyncDirective, directive, PartType, type PartInfo } from 'lit/async-directive.js';

/**
 * `<div ${spread(api.getRootProps())}>`: applies a Zag props object to an element with Zag's own
 * `spreadProps`, since lit-html templates can't spread an object of attributes and listeners.
 */
class SpreadDirective extends AsyncDirective {
  private cleanup?: () => void;

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('spread() goes on an element');
  }

  render(_props: Record<string, unknown>) {
    return nothing;
  }

  override update(part: ElementPart, [props]: [Record<string, unknown>]) {
    this.cleanup = spreadProps(part.element, props);
    return nothing;
  }

  protected override disconnected() {
    this.cleanup?.();
  }
}

export const spread = directive(SpreadDirective);
