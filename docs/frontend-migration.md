# Frontend Migration

`ui` is moving from SvelteKit to Angular (zoneless — standalone components, signals-based change detection, no Zone.js).

## Why

Dependency injection, hierarchical service scoping, and enforced separation of concerns matter more here than framework popularity or minimal bundle size. Angular is the only mainstream frontend framework with those as first-class, compiler-backed patterns rather than convention. Zoneless removes the historical bundle/runtime cost that used to be the main counter-argument; the remaining bundle-size gap versus Svelte isn't significant for this app's traffic (a low-volume subscribe/push page, no conversion-optimization pressure).

## Status

Decision made. Not started. Current `ui` (SvelteKit) stays live until migration begins.

## Scope (when work starts)

- Build tooling: Angular CLI / esbuild-based build vs. the current Vite/SvelteKit setup.
- SSR/prerendering story equivalent to SvelteKit's adapter, if still needed for the subscribe page.
- Fit into the existing `infra/` Docker/Caddy/CI pipeline (`docker-compose.yml`, `Caddyfile`, `.github/workflows/deploy.yml`).
- Update `docs/architecture.md`, README status/architecture sections, and `docs/whats-next.md` once the migration actually lands.
