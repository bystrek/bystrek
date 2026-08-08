# Architecture direction — bystrek

Living doc for where this project is heading, as of 2026-08-08. Not a snapshot of what's built (see `docs/whats-next.md` for that) — this is the target shape decisions should move toward. Update it when the direction actually changes, not just when a feature ships.

## Vision

Not just a chat wrapper around Claude. A centralized personal data platform — calendar, notes, research, medical records, nutrition, gym — with an LLM that can read and write into it, plus a real app for browsing, visualization, and summaries. Some domains mirror external services (e.g. iCloud Calendar via CalDAV); the point is bystrek holds its own copy either way, so the LLM and the app have one consistent store to work against.

## Layering (decided)

```
Chat UI ──tool calls──▶ Backend API ──▶ Postgres (+pgvector)
                             ▲              ▲
Custom app (browse/viz) ─────┘              │
                                              │
Sync connectors (calendar, ...) ─────────────┘
```

- **Backend API is the single gateway to the data.** Nothing else — chat tools, the app, sync jobs — talks to Postgres directly.
- **Chat and the app live in one installed PWA, one icon.** No repeat of day three's Open WebUI/push-service routing fight.
- **Chat UI is custom-built** (Vercel AI SDK for streaming/tool-call handling), not Open WebUI. Reasoning below.
- **Sync connectors** are small, scheduled, per-source jobs that pull and normalize into Postgres. Common interface once there are 2–3 of them, not before.

## Why not Open WebUI

Day three tried to bolt a push-notification subscribe page onto Open WebUI's origin and hit a real wall: iOS ties Web Push permission to the specific installed home-screen app, Open WebUI's subpath deployment support is historically broken (so moving it to make room was too risky to test live), and it has no supported way to inject custom UI into what it serves. Ended up disabling it entirely to unblock testing.

The deeper issue: Open WebUI is a full third-party frontend, and the vision above needs a real custom app anyway (browsing, visualization — things Open WebUI was never going to provide). Once that app exists, it can own chat too, using the same AI SDK plumbing (streaming, tool calls) that would otherwise sit behind Open WebUI's UI. One app, full control, no more fighting a black box's internals for integration points that only exist because we didn't own the frontend.

## Write safety

The LLM will have write access to sensitive domains (medical records, not just notes). Worth designing in from the start rather than retrofitting: soft-deletes/versioning on writes so nothing an LLM does is truly destructive, and likely explicit confirmation for a category of sensitive writes rather than silent auto-execution.

## Domains (decided)

- `bystrek.dev` — Caddy serves the custom UI (static frontend build). Also the only place `sw.js` can live — the service worker must be same-origin with the installed PWA.
- `api.bystrek.dev` — the backend API: DB access, auth. The single gateway to Postgres, per the layering above. New DNS record + Caddy site block, same DNS-01 pattern as today. Cross-origin from the frontend, so the API needs CORS scoped to `https://bystrek.dev`.
- `push-service` — reduced to notifications only, no public route at all. Internal-only, reachable exclusively as `push-service:8787` on the Docker network, called by `api.bystrek.dev`.

## API gateway (decided)

Caddy is the gateway — routes by domain to the frontend, the backend API, and (internally) push-service. No separate gateway component until there are enough public-facing services that shared cross-cutting logic (auth enforcement, rate limiting) stops being reasonable to keep in one place.

## CORS (decided)

Tailscale and CORS protect different things — Tailscale gates *who can reach the server*, CORS gates *which websites' JS can make credentialed requests using an already-open browser session*. A tailnet device's browser can still load a malicious/unrelated page that tries to hit `api.bystrek.dev` — Tailscale doesn't stop that. So: explicit origin allowlist, never a wildcard. `https://bystrek.dev` always; `http://localhost:5173` (or whatever the Vite dev port is) added only in development, via an env var, not hardcoded into what ships to prod.

## Auth (decided direction)

Multi-user from the start — modeled as a **household**: `users` belong to a `household`, every domain row has an `owner_id` and a `visibility` (`private` | `household`) with a sensible per-domain default (medical records private by default, shared-calendar-type stuff household by default), overridable per record. Not a fine-grained per-item ACL system — deliberately simpler than that.

Auth library: **better-auth**, self-hosted (TypeScript-native, Hono-compatible, has OAuth/social login built in). Rejected Auth0/Okta — Okta is enterprise workforce IAM, wrong category of tool entirely; Auth0 would work but means routing every family member's login through a third party, which cuts against the project's self-hosted/own-your-data pattern everywhere else (Tailscale-only, non-identifying domain, self-hosted push). The "SSO" want is really OAuth social login (sign in with Google/Apple instead of a new password) — `better-auth` provides that natively, so self-hosting doesn't cost the convenience a hosted IdP would have bought.

Bearer tokens (`Authorization` header), not cookies, given the two-origin split — sidesteps cross-origin-cookie/CSRF complexity; CORS becomes defense-in-depth rather than the only gate.

Sign-in method to start: **Sign in with Apple** only (via `better-auth`'s OAuth support). Other providers (Google, etc.) can be added later without a redesign.

Sharing granularity: per-record `visibility` (`private` | `household`) is sufficient — no need for per-specific-member sharing.

## Encryption of sensitive data (decided)

**Tier 2 for everything**: application-level field encryption (AES-256-GCM, encrypt/decrypt in the backend, not via `pgcrypto` so the key never appears in a SQL query string) on sensitive columns across all domains. Protects against DB-only exposure (leaked backups, a read-only compromise) while keeping all data LLM-usable, since the backend decrypts before an Anthropic API call. No tier-3 zero-knowledge "vault" — explicitly chose LLM-readability everywhere over admin-blindness on a subset; nothing in the system is meant to be opaque to the assistant.

## Open questions (tech stack — being decided next)

- Frontend framework/meta-framework.
- ORM/DB access layer for Postgres.
- Key management for tier-2 encryption: same `.env`-on-the-droplet pattern as existing secrets, or something more (envelope encryption, a proper secrets manager)?
- Which columns actually need encryption vs. which are fine as plain (e.g. calendar timestamps don't need it, medical notes do) — needs a pass per domain once schemas are drafted.
- Testing approach per layer.
- What happens to the Open WebUI container on the droplet (retire it, or keep as fallback for a while).
