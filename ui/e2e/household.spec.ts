import { expect, test } from '@playwright/test';

function mockSession(page: import('@playwright/test').Page, role: 'user' | 'admin') {
	return page.route('**/api/auth/get-session', (route) =>
		route.fulfill({ json: { session: {}, user: { id: '1', name: 'Michał', role } } })
	);
}

function mockSignIn(page: import('@playwright/test').Page) {
	// PUBLIC_API_URL (localhost:3000) is a different origin from the app
	// (localhost:4173) even under Playwright's route interception, so the
	// browser still applies CORS header-exposure rules to the mocked
	// response — Access-Control-Expose-Headers is required for
	// res.headers.get('set-auth-token') to see it, same as the real API.
	return page.route('**/api/auth/sign-in/email', (route) =>
		route.fulfill({
			status: 200,
			headers: {
				'set-auth-token': 'fake-token',
				'Access-Control-Expose-Headers': 'set-auth-token'
			},
			json: { token: 'fake-token', user: { id: '1' } }
		})
	);
}

test('shows a login form when signed out', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('#login')).toBeVisible();
	await expect(page.locator('#household')).toHaveCount(0);
});

test('signs in and shows household members, without admin controls for a regular member', async ({
	page
}) => {
	await mockSignIn(page);
	await mockSession(page, 'user');
	await page.route('**/household', (route) =>
		route.fulfill({
			json: { name: 'bystrek', members: [{ id: '1', name: 'Michał', status: 'active', banned: false }] }
		})
	);

	await page.goto('/');
	await page.waitForLoadState('networkidle');

	await page.getByPlaceholder('Email').fill('me@example.com');
	await page.getByPlaceholder('Password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.locator('#household h2')).toHaveText('bystrek');
	await expect(page.locator('#household li')).toContainText('Michał');
	await expect(page.locator('#invite')).toHaveCount(0);
});

test('shows invite form and ban controls for an admin', async ({ page }) => {
	await mockSignIn(page);
	await mockSession(page, 'admin');
	await page.route('**/household', (route) =>
		route.fulfill({
			json: { name: 'bystrek', members: [{ id: '1', name: 'Michał', status: 'active', banned: false }] }
		})
	);

	await page.goto('/');
	await page.waitForLoadState('networkidle');

	await page.getByPlaceholder('Email').fill('admin@example.com');
	await page.getByPlaceholder('Password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.locator('#invite')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Ban' })).toBeVisible();
});
