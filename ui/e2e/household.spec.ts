import { expect, test } from '@playwright/test';

test('shows household members returned by the API', async ({ page }) => {
	await page.route('**/household', (route) =>
		route.fulfill({
			json: {
				name: 'bystrek',
				members: [{ name: 'Michał', email: 'michal@example.com', status: 'active' }]
			}
		})
	);

	await page.goto('/');

	await expect(page.locator('#household h2')).toHaveText('bystrek');
	await expect(page.locator('#household li')).toHaveText('Michał active');
});

test('hides the household card when the API has nothing to show', async ({ page }) => {
	await page.route('**/household', (route) => route.fulfill({ status: 404, json: {} }));

	await page.goto('/');

	await expect(page.locator('#household')).toHaveCount(0);
});
