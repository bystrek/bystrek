# ui

Angular (zoneless, standalone, esbuild/Vite builder) frontend for bystrek — Pocket ID sign-in, agenda, places, settings. CSR-only, no SSR.

## Developing

```sh
bun install
bun run start   # ng serve, http://localhost:4200
```

## Config

The app fetches `/config.json` before bootstrap and exposes it through the `APP_CONFIG` injection token (`src/app/core/config/app-config.ts`). No build-time environment files.

- `public/config.json` — dev default: `apiUrl` is `/api`, which the dev server proxies to the real API (`proxy.conf.json` → `http://localhost:3000`).
- `config.prod.json` — copied over `config.json` in the Docker image: `apiUrl` is `https://api.bystrek.dev`.

To skip running the API locally and use the deployed one instead:

```sh
bun run start:remote   # proxy.remote.conf.json: /api → https://api.bystrek.dev
```

The API accepts any `http://localhost:*` origin, so no CORS setup is needed on either side. This hits production data — sign in with your real account and be deliberate.

## Signing in

Sign-in goes through Pocket ID; there are no passwords. **Sign in with Pocket ID** navigates to `${apiUrl}/auth/sign-in?to=<origin>/auth/callback`. The API moves the browser to its own origin, then to Pocket ID, and after the OAuth callback redirects back to `/auth/callback?ott=<one-time token>` (or `?error=<code>`). The callback route swaps the token for a bearer token at `POST /api/auth/one-time-token/verify` and stores it in `localStorage`; errors land on the login page. With `start:remote`, the callback runs on the production API and hands the session back to localhost.

## Building

```sh
bun run build   # ng build, outputs dist/ui/browser
```

## Testing

```sh
bun run test      # Vitest, unit/component
bun run test:e2e  # Playwright, WebKit only — see docs/architecture.md
```
