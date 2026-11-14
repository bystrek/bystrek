import { defineConfig, devices } from '@playwright/test';

// `bun run test:visual` sets VISUAL=1: it also serves the static Storybook build and runs the
// axe and screenshot projects. The three screen baselines are Linux/WebKit: update them with scripts/visual-baselines.sh.
const visual = !!process.env['VISUAL'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'bun run start -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    ...(visual
      ? [
          {
            command: 'bunx http-server storybook-static -p 6006 -s',
            url: 'http://localhost:6006',
            reuseExistingServer: !process.env['CI'],
          },
        ]
      : []),
  ],
  projects: visual
    ? [
        {
          name: 'a11y-stories',
          testMatch: 'visual/stories.a11y.ts',
          use: { ...devices['Desktop Safari'] },
        },
        {
          name: 'visual-screens',
          testMatch: 'visual/screens.visual.ts',
          use: { ...devices['Desktop Safari'] },
        },
      ]
    : [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
