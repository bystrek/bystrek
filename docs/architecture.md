# Architecture direction — bystrek

Target shape for where this project is heading, as of 2026-08-23. Not a snapshot of what's built — see [GitHub Issues](https://github.com/bystrek/bystrek/issues) for that. Update when the direction changes, not on every feature shipped.

## Vision

A personal data platform — calendar, notes, research, medical records, nutrition, gym — with an LLM that reads and writes into it, plus a real app for browsing and visualization. Some domains mirror external services (e.g. Infomaniak kCalendar via CalDAV); bystrek always keeps its own copy, so the LLM and the app share one store.

## Layering (decided)

```
Chat UI ──tool calls──▶ Backend API ──▶ Postgres (+pgvector)
                             ▲              ▲
Custom app (browse/viz) ─────┘              │
                                              │
Sync connectors (calendar, ...) ─────────────┘

Scheduler ──▶ RabbitMQ ──▶ Worker ──▶ Backend API / push
```

- Backend API is the single gateway to Postgres. Nothing else talks to it directly.
- Chat and the app live in one installed PWA, one icon.
- Chat UI is custom-built.
- Sync connectors are small, scheduled, per-source jobs. Shared interface once there are 2–3 of them.
- Scheduled/async work (daily agenda digest, later proactive nudging) runs through **RabbitMQ**: a scheduler publishes a job, a worker consumes it and calls the backend API/push. Keeps async work off the request path and out of ad hoc cron scripts, with retry/dead-letter handling built in.

## Frontend & chat (decided)

- **Angular** (zoneless — standalone components, signals-based change detection, no Zone.js). Dependency injection, hierarchical service scoping, and enforced separation of concerns matter more here than framework popularity or minimal bundle size — Angular is the only mainstream frontend framework with those as first-class, compiler-backed patterns rather than convention. Zoneless removes the historical bundle/runtime cost that used to be the main counter-argument.
- Call a hosted OpenAI-compatible API (Scaleway Generative APIs, Paris) rather than a self-hosted model: the home cluster can't run a model good enough for this. A small application-owned `LlmClient` contract separates the app from the inference provider.

## Write safety

The LLM never calls write tools. It drafts a typed action; the user confirms it in the UI, and only that confirmation writes. Applies to sensitive domains, medical records included. Soft-deletes/versioning on all writes.

## Domains (decided)

- `bystrek.dev` — Caddy serves the custom UI, including `sw.js` (same-origin with the installed PWA) and the push subscribe/send flow.
- `api.bystrek.dev` — backend API: DB access, auth, push send/subscribe. CORS scoped to `https://bystrek.dev`.

## API gateway (decided)

Caddy routes by domain to the frontend and the backend API. No separate gateway component until enough public services make shared auth/rate-limiting logic worth centralizing.

## CORS (decided)

CORS scopes which sites' JavaScript can use an already-open browser session. Use an explicit origin allowlist, never a wildcard: `https://bystrek.dev` (via `CORS_ORIGINS`) plus any `http://localhost:*` origin, hardcoded. This lets a local UI talk to any API instance without per-deploy configuration.

## Auth (decided direction)

- Multi-user directly on `users`, no household grouping layer: every row has `owner_id` + `visibility` (`private`/`shared`), sensible per-domain default, overridable per record. No per-item ACLs. A second family gets its own instance and database; instance-level separation is the isolation boundary.
- **better-auth**, embedded in the API, signing in through the self-hosted Pocket ID (OIDC, passkeys) like the other homelab apps — identity stays on our own hardware rather than with a third-party provider. Mounted directly via `better-auth/node`'s `toNodeHandler`, ahead of Nest's own JSON body parser (`bodyParser: false` + a manual `express.json()` after the mount) — no third-party NestJS wrapper package, to avoid stacking a second unofficial-Bun-compat dependency on top of the accepted Nest-on-Bun risk below.
- Bearer tokens, not cookies — sidesteps cross-origin-cookie/CSRF complexity, and carries over to the planned Capacitor app, whose WebView is a different site from the API. The OAuth callback hands the session to the UI as a single-use, 3-minute one-time token in the redirect URL (`/auth/handoff`), which the UI swaps for the bearer token. Sessions last a fixed 7 days from the Pocket ID sign-in and are never extended by use, so someone removed in Pocket ID loses access within a week; everyone else signs in again weekly (one passkey tap). The UI keeps an unguessable per-tab `state` in `sessionStorage` and only redeems a one-time token that comes back with it, so a forwarded callback link can't sign someone into another account.
- **Pocket ID is the only way in** (#156): no passwords, invites or sign-up form. Whoever the Pocket ID `bystrek` client allows can sign in; their account is created on the first sign-in, and an existing account is linked by email. Members of the `bystrek-admins` group get `role: admin`, re-read on every sign-in. Granting or revoking access happens in Pocket ID only.
- Sharing granularity: `private`/`shared` is enough, no per-member sharing.

## Encryption of sensitive data (decided)

Tier 2 for everything: app-level field encryption (AES-256-GCM, not `pgcrypto`) on sensitive columns. Protects against DB-only exposure while staying LLM-usable — the backend decrypts before calling the model. The model is hosted, so a feature sends it only what it needs; calendar-ask sends the question, never events. No tier-3 zero-knowledge vault; nothing is meant to be opaque to the assistant.

Key management: `.env` on the home server, alongside other secrets.

## Backend framework + ORM (decided)

**NestJS** — a real IoC container (modules, providers, Guards, Interceptors) for proper DI.

**Drizzle** (ORM) — mirrors real SQL directly rather than abstracting it away, avoids N+1-prone lazy-loading patterns, has native Bun support. Costs: no built-in field-encryption hook (wrap manually), NestJS integration is unofficial (hand-write a thin provider).

## Runtime (decided)

**Bun**, for `api.bystrek.dev`. Drizzle has no Bun risk (native support). Nest-on-Bun is the only residual risk — works, ~90%+ compat, not officially blessed — accepted because this specific choice is cheap to reverse (Docker base-image swap, not a rewrite) and both Nest and Drizzle run identically on Node if it doesn't hold up. Shake it down for real use before trusting it fully, not just a smoke test.

## Deployment (decided)

- CI (GitHub Actions) builds each service's Docker image as a check on every PR and merge, without pushing.
- A manual Release workflow publishes both images to GHCR under one immutable CalVer tag (`YYYY.M.N`), matching the git tag and GitHub release.
- Deploying means pinning that version tag in `bystrek/homelab` (`clusters/home/apps/bystrek/{api,ui}/kustomization.yaml`). Flux rolls it out to k3s when the owner cuts a `homelab` release tag.
- Migrations run automatically at container boot (entrypoint runs `drizzle-kit migrate`, then starts the app). Safe here specifically because it's a single instance, no rolling/concurrent deploys.
- Rollback: pin an older version in `homelab`.

## Testing (decided)

- `api`: unit tests for pure logic (encryption helpers, tool-call-loop parsing) plus integration tests against a real local Postgres, each wrapped in a rolled-back transaction — no mocked DB as the primary safety net. Runner: Bun's native `bun:test`.
- `ui`: Vitest for unit/component logic, Playwright (WebKit only) for e2e — service worker, push, and passkey flows need a real browser, and WebKit specifically since iOS Safari fidelity is the actual target.
- E2E stays small: a handful of real user journeys, not edge-case coverage.
- No real third-party calls (Resend, CalDAV, FCM/APNs) in any test — stub at the boundary.
- CI gate: tests run before image build/push; `timeout-minutes: 10` enforces the budget.

## Future shape: connectors, multi-user, multi-LLM (not decided)

Three separable axes, each optional independently — none block building the next domain today:

- **Domain connectors** — per-domain backend choice (bystrek-owned store, or an external service). A shared connector interface is only worth building once a domain has 2+ interchangeable backends; a domain with a single implementation (e.g. calendar → CalDAV) doesn't need the abstraction yet.
- **Per-user enablement** — which domains/connectors a given user has active. An extension of the existing per-user model, not a new subsystem.
- **LLM provider** — chat's tool-calling interface stays provider-agnostic so the inference backend can change without coupling it to domain connectors.

Each gets designed when a second real case (second backend, second user, second provider) actually shows up, not ahead of time.

## Open questions

- Which columns need encryption vs. plain — pass needed per domain once schemas are drafted.
