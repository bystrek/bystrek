# What's Next — bystrek.dev

Day four's scaffold is live (see below). Open WebUI is retired. `push-service` is fully removed — folded into `api`/`ui`, no trace left. See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR; Dockge (dashboard, manual pull-and-redeploy, loopback + SSH tunnel only) and Watchtower (label-scoped auto-redeploy) run the deploy. `push-service` is gone entirely: container, Caddy route, source directory, CI workflow, and its now-redundant SQLite data volume (real subscription data confirmed migrated to Postgres first) all removed.

Deferred, not part of this scaffold: household/user data model (`owner_id` + `visibility`), auth (`better-auth`, invite-gated passkeys + magic-link via Resend), tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 2 (testing infra) first, then item 3 (calendar) — the first real vertical slice, which will need the auth + data model pieces above built alongside it.

## 2. Testing infra (next up)

Decided in day five's session (see devlog); not yet built.

- `api`: switch from Nest's default Jest scaffold to Bun's native test runner (`bun:test`) — spike `@nestjs/testing`'s `TestingModule` under it first to confirm compatibility before removing Jest. Jest is the documented fallback if it doesn't hold up.
- `api`: integration tests against the existing local Postgres (`docker-compose.dev.yml`), each test wrapped in a transaction rolled back afterward — no mocked DB as the primary safety net. Unit tests only for pure logic (encryption helpers, tool-call-loop parsing, once they exist).
- `ui`: Vitest for unit/component logic; Playwright, WebKit only, for e2e (service worker, push subscribe, later passkey login via Playwright's virtual WebAuthn authenticator). WebKit-only because iOS Safari fidelity is the actual target, not general cross-browser coverage.
- Keep the e2e suite small — a handful of real user journeys, not edge-case coverage (that belongs in unit/integration tests).
- No real third-party calls in any test (Resend, CalDAV, FCM/APNs) — stub at the boundary.
- CI: add a test step before the Docker build/push in both `api.yml` and `ui.yml`; Postgres as a GitHub Actions service container; cache Playwright's browser binary; `timeout-minutes: 10` on the job to keep the whole suite well under 10 minutes.

## 3. Calendar (first vertical slice)

- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password) as a sync connector — pulls into the Postgres-backed calendar table on a schedule, rather than calling iCloud live on every request.
- Expose it to the LLM as a tool in the backend API's own `@anthropic-ai/sdk` tool-call loop, calling the backend's own calendar routes directly — no separate "Workspace Tool" translation layer (that was Open WebUI's model, not this one).
- One custom-app view: browse calendar events.
- System prompt context: timezone (Warsaw), working hours, default calendar name.

## 4. Notes/research/medical/nutrition/gym domains

- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — iCloud Notes has no API. Options: a separate notes/reminders app with an actual API, plain Markdown files in an iCloud Drive folder, or just make note-taking native to the new app (no external sync needed at all, unlike calendar).
- Medical records: tier-2 encryption applies (see architecture doc).

## 5. Proactive nudging

- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 3/4 existing first — "did I do it" means checking real data.

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency; parked there for whenever it actually happens.
