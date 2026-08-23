# ui

Angular (zoneless, standalone, esbuild/Vite builder) frontend for bystrek — login, push notifications, user admin, password reset. CSR-only, no SSR.

## Developing

```sh
bun install
bun run start   # ng serve, http://localhost:4200
```

Talks to the API at `src/environments/environment.ts`'s `apiUrl` (defaults to `http://localhost:3000`).

## Building

```sh
bun run build   # ng build, outputs dist/ui/browser
```

## Testing

```sh
bun run test      # Vitest, unit/component
bun run test:e2e  # Playwright, WebKit only — see docs/architecture.md
```
