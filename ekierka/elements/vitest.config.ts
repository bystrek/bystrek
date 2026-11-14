import { defineVitestConfig } from '@stencil/vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Keyboard behaviour comes from native radio inputs, so it is only testable in a real browser.
// Chromium, not WebKit: WebKit on macOS only tabs to text fields by default, so Tab tests fail
// locally there. CI's Playwright image ships both.
export default defineVitestConfig({
  stencilConfig: './stencil.config.ts',
  test: {
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./vitest-setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
