import { expect, test } from '@playwright/test';

// The real Push API needs a real push service (FCM/APNs) behind it, which
// we deliberately don't hit in tests (see docs/architecture.md's testing
// section) — the actual push delivery path is verified manually against
// the deployed stack. This test stubs the browser's service worker/push
// surface and the backend endpoints, and checks the UI's own logic: does
// clicking "Enable notifications" walk through permission -> register ->
// fetch VAPID key -> subscribe -> POST, and land on "Subscribed."?
test('enabling notifications subscribes and shows confirmation', async ({ page }) => {
  // Must be valid base64url (the app's urlBase64ToUint8Array feeds it to atob())
  // — doesn't need to be a real EC key, just decodable.
  const fakeVapidPublicKey =
    'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ';
  await page.route('**/push/vapid-public-key', (route) =>
    route.fulfill({ json: { publicKey: fakeVapidPublicKey } }),
  );

  let subscribeRequestBody: unknown;
  await page.route('**/push/subscribe', async (route) => {
    subscribeRequestBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });

  // / is now behind authGuard — push controls only render once initSession()
  // resolves a session, which only happens when a token is already stored.
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: { user: { id: '1', name: 'Michał', role: 'user' } } }),
  );
  await page.route('**/household', (route) => route.fulfill({ status: 404, json: {} }));

  await page.addInitScript(() => {
    window.localStorage.setItem('bystrek_token', 'fake-token');

    const fakeSubscription = {
      endpoint: 'https://fake-push-service.example.com/fake-endpoint',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
        };
      },
    };

    const fakeRegistration = {
      pushManager: {
        subscribe: async () => fakeSubscription,
        getSubscription: async () => null,
      },
    };

    // @ts-expect-error test-only global shim
    window.PushManager = window.PushManager ?? function () {};

    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: async () => 'granted' },
      configurable: true,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: async () => fakeRegistration,
        ready: Promise.resolve(fakeRegistration),
        getRegistration: async () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto('/');
  // Dev-mode Vite serves the client bundle as unbundled ES modules; goto()
  // resolves on `load`, which can fire before hydration finishes attaching
  // event listeners. Without this wait, the click below occasionally lands
  // on a not-yet-interactive button and silently does nothing.
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Enable notifications' }).click();

  await expect(page.locator('#status')).toHaveText('Subscribed.');
  await expect(page.getByRole('button', { name: 'Subscribed' })).toBeDisabled();

  expect(subscribeRequestBody).toEqual({
    endpoint: 'https://fake-push-service.example.com/fake-endpoint',
    keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
  });
});
