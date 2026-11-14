import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// One screenshot per Storybook story, taken from the static build (`bun run build-storybook`).
// Baselines are Linux/WebKit: update them in the Playwright container (see README).
const storybook = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006';

const index = JSON.parse(
  readFileSync(path.join(__dirname, '../../storybook-static/index.json'), 'utf8'),
) as { entries: Record<string, { id: string; type: string }> };
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

for (const { id } of stories) {
  test(id, async ({ page }) => {
    await page.goto(`${storybook}/iframe.html?id=${id}&viewMode=story`);
    await page.locator('#storybook-root:not(:empty)').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true, animations: 'disabled' });
  });

  test(`${id} has no axe violations`, async ({ page }) => {
    await page.goto(`${storybook}/iframe.html?id=${id}&viewMode=story`);
    await page.locator('#storybook-root:not(:empty)').waitFor();
    // The a11y addon runs its own axe on render; `toPass` retries while that run holds the page.
    await expect(async () => {
      const { violations } = await new AxeBuilder({ page }).include('#storybook-root').analyze();
      expect(violations).toEqual([]);
    }).toPass();
  });
}
