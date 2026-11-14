import type { Page } from '@playwright/test';

export function mockSignIn(page: Page) {
  return page.route('**/api/auth/one-time-token/verify', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-auth-token': 'fake-token' },
      json: { token: 'fake-token', user: { id: '1' } },
    }),
  );
}

export function mockSession(page: Page) {
  return page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: '1',
          name: 'Michał B',
          role: 'user',
          firstName: 'Michał',
          lastName: 'B',
          image: null,
        },
      },
    }),
  );
}
