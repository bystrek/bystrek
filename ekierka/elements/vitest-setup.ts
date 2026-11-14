import './src/tokens.css';
import * as elements from './dist/components/index.js';

for (const [name, define] of Object.entries(elements)) {
  if (name.startsWith('defineCustomElement')) (define as () => void)();
}
