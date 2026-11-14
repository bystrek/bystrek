import type { CSSResult } from 'lit';

const adopted = new WeakMap<DocumentOrShadowRoot, Set<CSSSheet>>();
type CSSSheet = CSSStyleSheet;

/**
 * Light-DOM elements can't use Lit's `static styles` (those go into the element's own shadow
 * root), so their CSS is adopted into the root the element lives in: the document, or the shadow
 * root of whatever component hosts it. Call from `connectedCallback`; each root gets a sheet once.
 */
export function adoptStyles(host: Element, styles: CSSResult): void {
  const root = host.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot) || !styles.styleSheet) return;
  const seen = adopted.get(root) ?? new Set();
  adopted.set(root, seen);
  if (seen.has(styles.styleSheet)) return;
  seen.add(styles.styleSheet);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, styles.styleSheet];
}
