import type { CSSResult } from 'lit';

const adopted = new WeakSet<CSSResult>();

/**
 * Light-DOM elements can't use Lit's `static styles` (those go into a shadow root), so their CSS
 * is adopted into the document once, scoped to the element with `@scope`.
 */
export function adoptDocumentStyles(styles: CSSResult): void {
  if (adopted.has(styles) || !styles.styleSheet) return;
  adopted.add(styles);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles.styleSheet];
}
