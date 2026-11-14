import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// An axe check per Storybook story, from the static build (`bun run build-storybook`).
const storybook = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006';

const index = JSON.parse(
  readFileSync(path.join(__dirname, '../../storybook-static/index.json'), 'utf8'),
) as { entries: Record<string, { id: string; type: string }> };
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

for (const { id } of stories) {
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
