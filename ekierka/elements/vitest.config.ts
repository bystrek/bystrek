import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Keyboard and focus behaviour comes from the browser, so element tests run in real ones. CI runs
// all three engines; locally set EKIERKA_BROWSERS=chromium to skip the others.
const browsers = (process.env['EKIERKA_BROWSERS'] ?? 'chromium,webkit,firefox').split(',');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: browsers.map((browser) => ({ browser }) as { browser: 'chromium' }),
    },
  },
});
