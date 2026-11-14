import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Keyboard behaviour comes from the browser, so these run in a real one (Chromium; see
// ekierka/elements/vitest.config.ts for why not WebKit locally).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
