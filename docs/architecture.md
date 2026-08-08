# Architecture direction — bystrek

Target shape for where this project is heading, as of 2026-08-08. Not a snapshot of what's built — see `docs/whats-next.md` for that. Update when the direction changes, not on every feature shipped.

## Vision

A personal data platform — calendar, notes, research, medical records, nutrition, gym — with an LLM that reads and writes into it, plus a real app for browsing and visualization. Some domains mirror external services (e.g. iCloud Calendar via CalDAV); bystrek always keeps its own copy, so the LLM and the app share one store.

## Layering (decided)

```
Chat UI ──tool calls──▶ Backend API ──▶ Postgres (+pgvector)
                             ▲              ▲
Custom app (browse/viz) ─────┘              │
                                              │
Sync connectors (calendar, ...) ─────────────┘
```

- Backend API is the single gateway to Postgres. Nothing else talks to it directly.
- Chat and the app live in one installed PWA, one icon.
- Chat UI is custom-built, not Open WebUI.
- Sync connectors are small, scheduled, per-source jobs. Shared interface once there are 2–3 of them.

## Why not Open WebUI

Day three hit a wall bolting push notifications onto Open WebUI: iOS ties Web Push permission to the installed home-screen app, Open WebUI's subpath routing is broken, and it has no way to inject custom UI. Retired it entirely.

Deeper reason: the vision needs a real custom app anyway (browsing, viz). Once it exists, it can own chat too — one app, full control.

## Frontend & chat (decided)

- **Svelte (SvelteKit)**. Angular has no maintained streaming/tool-call chat library; Svelte's mutation-friendly reactivity fits streaming chat state better, and gives the best PWA story (absorbs `push-service`'s `sw.js`).
- **No Vercel AI SDK.** Talk to `@anthropic-ai/sdk` directly, stream raw SSE. This is a Claude-only app — AI SDK's multi-provider abstraction buys nothing. Cost: hand-write the multi-step tool-call loop (~30–80 lines).
- **RxJS** on the frontend to consume the stream. Not required (a plain async generator would work), but its operators (e.g. `switchMap` to cancel an in-flight stream) and native fit with Svelte's store contract earn their keep.

## Write safety

LLM has write access to sensitive domains, medical records included. Soft-deletes/versioning on all writes; explicit confirmation for sensitive writes rather than silent auto-execution.

## Domains (decided)

- `bystrek.dev` — Caddy serves the custom UI. Only place `sw.js` can live (same-origin with the installed PWA).
- `api.bystrek.dev` — backend API: DB access, auth. CORS scoped to `https://bystrek.dev`.
- `push-service` — notifications only, internal-only (`push-service:8787`), called by `api.bystrek.dev`.

## API gateway (decided)

Caddy routes by domain to the frontend, the backend API, and (internally) push-service. No separate gateway component until enough public services make shared auth/rate-limiting logic worth centralizing.

## CORS (decided)

Tailscale gates who can reach the server; CORS gates which sites' JS can use an already-open browser session — different protections. Explicit origin allowlist, never a wildcard: `https://bystrek.dev` always, `http://localhost:5173` only in dev, via env var.

## Auth (decided direction)

- Multi-user via **household**: users belong to a household, every row has `owner_id` + `visibility` (`private`/`household`), sensible per-domain default, overridable per record. No per-item ACLs.
- **better-auth**, self-hosted. Rejected Auth0/Okta — wrong category (Okta) or against the self-hosted/own-your-data pattern (Auth0).
- Bearer tokens, not cookies — sidesteps cross-origin-cookie/CSRF complexity.
- **Sign in with Apple** only, to start.
- Sharing granularity: `private`/`household` is enough, no per-member sharing.

## Encryption of sensitive data (decided)

Tier 2 for everything: app-level field encryption (AES-256-GCM, not `pgcrypto`) on sensitive columns. Protects against DB-only exposure while staying LLM-usable — the backend decrypts before calling Claude. No tier-3 zero-knowledge vault; nothing is meant to be opaque to the assistant.

Key management: same `.env`-on-droplet pattern as other secrets.

## Backend framework + ORM (decided)

**NestJS** — chosen for proper DI (a real IoC container: modules, providers, Guards, Interceptors). Ruled out:
- Alosaur/Deno — ecosystem too small, DB support unverified.
- Elysia — DI-like context helpers only, not a real IoC container.
- Deepkit — best DI technically, but alpha status, a 2025 EU trademark loss, thin production use, no 2026 release — too risky for a platform holding medical records.

**Drizzle** (ORM) — chosen over Prisma, TypeORM, MikroORM:
- TypeORM/MikroORM use Hibernate/Doctrine-style Unit-of-Work + lazy proxies — the exact mechanism behind the classic N+1 problem.
- Prisma avoids that risk too, but abstracts SQL away — the opposite of the hands-on-SQL practice this project also serves.
- Drizzle avoids the N+1 risk, mirrors real SQL, has native Bun support. Costs: no built-in field-encryption hook (wrap manually), NestJS integration is unofficial (hand-write a thin provider).

## Runtime (decided)

**Bun**, for `api.bystrek.dev`. Drizzle has no Bun risk (native support). Nest-on-Bun is the only residual risk — works, ~90%+ compat, not officially blessed — accepted because this specific choice is cheap to reverse (Docker base-image swap, not a rewrite) and both Nest and Drizzle run identically on Node if it doesn't hold up. Shake it down for real use before trusting it fully, not just a smoke test.

## Open questions

- Which columns need encryption vs. plain — pass needed per domain once schemas are drafted.
- Testing approach per layer.
- Open WebUI container on the droplet: retire, or keep as fallback.
