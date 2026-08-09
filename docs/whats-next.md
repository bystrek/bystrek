# What's Next — bystrek.dev

Day four's scaffold is live (see below). Open WebUI is retired. `push-service` is fully removed — folded into `api`/`ui`, no trace left. See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR; Dockge (dashboard, manual pull-and-redeploy, loopback + SSH tunnel only) and Watchtower (label-scoped auto-redeploy) run the deploy. `push-service` is gone entirely: container, Caddy route, source directory, CI workflow, and its now-redundant SQLite data volume (real subscription data confirmed migrated to Postgres first) all removed.

Deferred, not part of this scaffold: household/user data model (`owner_id` + `visibility`), auth (`better-auth`, invite-gated passkeys + magic-link via Resend), tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 4 (calendar) — the first real vertical slice, which will need the auth + data model pieces above built alongside it. Item 3 (deploy pipeline) is a smaller infra follow-up that can slot in opportunistically, not a blocker.

## 2. Done: testing infra

`api` runs on Bun's native test runner (`bun:test`, Jest removed) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. Both `api.yml` and `ui.yml` gate the Docker build/push behind a test job in CI, comfortably under a 10-minute budget. Reasoning and build notes in `devlog/2026-08-09-day-05.md`.

## 3. Deploy pipeline: infra-as-code

Decided in day five's second session (see devlog); not yet built.

- Swap `containrrr/watchtower` → `nicholas-fedor/watchtower` in `infra/docker-compose.yml` and on the droplet. The original was archived (read-only) 2025-12-17; the fork is a drop-in, config-compatible replacement.
- Write an Ansible playbook so the droplet's compose file/Caddyfile are applied *from* the repo instead of scp'd by hand — single environment for now, no dev/prod scaffolding yet. Run by hand initially, using the existing full-access SSH key; a CI-triggered deploy is a separate, deferred question (and if it happens, needs a scoped/restricted credential, not just a non-root user — docker-group membership is root-equivalent).
- Once the Ansible path is proven, remove Watchtower entirely rather than keep it as a safety net — it'd be a slower, redundant path to the same redeploy, and a standing Docker-socket-privileged service with no remaining purpose.
- Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate, natural fit for GitHub Environments) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point (CT-log/identity tradeoff to flag again then).

## 4. Calendar (first vertical slice)

- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password) as a sync connector — pulls into the Postgres-backed calendar table on a schedule, rather than calling iCloud live on every request.
- Expose it to the LLM as a tool in the backend API's own `@anthropic-ai/sdk` tool-call loop, calling the backend's own calendar routes directly — no separate "Workspace Tool" translation layer (that was Open WebUI's model, not this one).
- One custom-app view: browse calendar events.
- System prompt context: timezone (Warsaw), working hours, default calendar name.

## 5. Notes/research/medical/nutrition/gym domains

- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — iCloud Notes has no API. Options: a separate notes/reminders app with an actual API, plain Markdown files in an iCloud Drive folder, or just make note-taking native to the new app (no external sync needed at all, unlike calendar).
- Medical records: tier-2 encryption applies (see architecture doc).

## 6. Proactive nudging

- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 4/5 existing first — "did I do it" means checking real data.

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency; parked there for whenever it actually happens.
