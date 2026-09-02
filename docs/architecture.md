# Architecture direction — bystrek

Target shape for where this project is heading, as of 2026-08-23. Not a snapshot of what's built — see `docs/roadmap.md` for that. Update when the direction changes, not on every feature shipped.

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
- **No Vercel AI SDK.** Talk to `@anthropic-ai/sdk` directly, stream raw SSE. This is a Claude-only app — AI SDK's multi-provider abstraction buys nothing. Cost: hand-write the multi-step tool-call loop (~30–80 lines).

## Write safety

LLM has write access to sensitive domains, medical records included. Soft-deletes/versioning on all writes; explicit confirmation for sensitive writes rather than silent auto-execution.

## Domains (decided)

- `bystrek.dev` — Caddy serves the custom UI, including `sw.js` (same-origin with the installed PWA) and the push subscribe/send flow.
- `api.bystrek.dev` — backend API: DB access, auth, push send/subscribe. CORS scoped to `https://bystrek.dev`.

## API gateway (decided)

Caddy routes by domain to the frontend and the backend API. No separate gateway component until enough public services make shared auth/rate-limiting logic worth centralizing.

## CORS (decided)

Tailscale gates who can reach the server; CORS gates which sites' JS can use an already-open browser session — different protections. Explicit origin allowlist, never a wildcard: `https://bystrek.dev` (via `CORS_ORIGINS`) plus any `http://localhost:*` origin, hardcoded — a page served from localhost is a process already on that machine, which CORS never guarded against. Lets a local UI talk to any instance of the API, including the deployed one, with no per-deploy config.

## Auth (decided direction)

- Multi-user directly on `users`, no household grouping layer: every row has `owner_id` + `visibility` (`private`/`shared`), sensible per-domain default, overridable per record. No per-item ACLs. A second family wanting bystrek gets its own instance/droplet/DB, not a second tenant on this one — the sensitive data here (medical records, private chat) is only tier-2 encrypted (see below), so instance-level separation is the actual isolation boundary, not an app-level tenant id.
- **better-auth**, self-hosted, embedded in the API — keeps auth data owned rather than routed through a third-party identity provider. Mounted directly via `better-auth/node`'s `toNodeHandler`, ahead of Nest's own JSON body parser (`bodyParser: false` + a manual `express.json()` after the mount) — no third-party NestJS wrapper package, to avoid stacking a second unofficial-Bun-compat dependency on top of the accepted Nest-on-Bun risk below.
- Bearer tokens, not cookies — sidesteps cross-origin-cookie/CSRF complexity. Sessions use a 90-day rolling TTL, refreshed if used within the last day.
- **Email/password only for v1** — no magic-link, no passkey. No public signup: an admin creates the user row directly (`status: invited`); `disableSignUp: true` means only an email with an existing row can sign in. Inviting a member and a forgotten password are the same mechanism — both send a Resend-delivered "set your password" link through the admin plugin's password-reset flow, rather than a separate invite-token system.
- **User management**: `better-auth`'s admin plugin (create/list/ban/unban users) backs a small in-app page — no separate admin console or hosted dashboard.
- **Passkey (WebAuthn)**: deferred past v1. Adds independently later (own credential table, doesn't touch the schema already built) as a per-device credential added from an authenticated session, not as the account-bootstrap method.
- Sharing granularity: `private`/`shared` is enough, no per-member sharing.

## Encryption of sensitive data (decided)

Tier 2 for everything: app-level field encryption (AES-256-GCM, not `pgcrypto`) on sensitive columns. Protects against DB-only exposure while staying LLM-usable — the backend decrypts before calling Claude. No tier-3 zero-knowledge vault; nothing is meant to be opaque to the assistant.

Key management: same `.env`-on-droplet pattern as other secrets.

## Backend framework + ORM (decided)

**NestJS** — a real IoC container (modules, providers, Guards, Interceptors) for proper DI.

**Drizzle** (ORM) — mirrors real SQL directly rather than abstracting it away, avoids N+1-prone lazy-loading patterns, has native Bun support. Costs: no built-in field-encryption hook (wrap manually), NestJS integration is unofficial (hand-write a thin provider).

## Runtime (decided)

**Bun**, for `api.bystrek.dev`. Drizzle has no Bun risk (native support). Nest-on-Bun is the only residual risk — works, ~90%+ compat, not officially blessed — accepted because this specific choice is cheap to reverse (Docker base-image swap, not a rewrite) and both Nest and Drizzle run identically on Node if it doesn't hold up. Shake it down for real use before trusting it fully, not just a smoke test.

## Deployment (decided)

- CI (GitHub Actions) builds each service's Docker image, pushes to GHCR, then redeploys over SSH — gated by a GitHub Environment requiring manual approval.
- The deploy credential is restricted via a forced command in the droplet's `authorized_keys`: it can only run one fixed script (`docker compose pull && up -d --remove-orphans`), nothing else.
- Migrations run automatically at container boot (entrypoint runs `drizzle-kit migrate`, then starts the app). Safe here specifically because it's a single instance, no rolling/concurrent deploys.
- No rollback tooling.
- **Dockge** on the droplet: dashboard for running containers/logs, manual pull-and-redeploy per stack. Reachable only via Tailscale, same trust boundary as everything else. Needs Docker socket access, accepted as inherent to what it does.

## Testing (decided)

- `api`: unit tests for pure logic (encryption helpers, tool-call-loop parsing) plus integration tests against a real local Postgres, each wrapped in a rolled-back transaction — no mocked DB as the primary safety net. Runner: Bun's native `bun:test`.
- `ui`: Vitest for unit/component logic, Playwright (WebKit only) for e2e — service worker, push, and passkey flows need a real browser, and WebKit specifically since iOS Safari fidelity is the actual target.
- E2E stays small: a handful of real user journeys, not edge-case coverage.
- No real third-party calls (Resend, CalDAV, FCM/APNs) in any test — stub at the boundary.
- CI gate: tests run before image build/push; `timeout-minutes: 10` enforces the budget.

## Open questions

- Which columns need encryption vs. plain — pass needed per domain once schemas are drafted.
