# What's Next — bystrek.dev

Day four's scaffold is live (see below). Open WebUI is retired. `push-service` is fully removed — folded into `api`/`ui`, no trace left. See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR and deploys via a forced-command-restricted SSH key, gated by a GitHub Environment (see item 3); Dockge (dashboard, loopback + SSH tunnel only) stays for visibility and manual overrides. `push-service` is gone entirely: container, Caddy route, source directory, CI workflow, and its now-redundant SQLite data volume (real subscription data confirmed migrated to Postgres first) all removed.

Deferred, not part of this scaffold: household/user data model (`owner_id` + `visibility`), auth (`better-auth`, invite-gated passkeys + magic-link via Resend), tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 4 (calendar) — the first real vertical slice, which will need the auth + data model pieces above built alongside it.

## 2. Done: testing infra

`api` runs on Bun's native test runner (`bun:test`, Jest removed) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget. Reasoning and build notes in `devlog/2026-08-09-day-05.md`.

## 3. Done: deploy pipeline — CI-triggered, no Watchtower

One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. That restriction is what makes SSH-from-CI acceptable here, after it was rejected twice before on `push-service` and on day four for being a production-capable key in GitHub secrets (see devlog).

Ansible was considered and dropped for a plain script — direct comparison against Kamal, Komodo, and Docker Swarm is in day five's devlog. Rollback tooling is explicitly out of scope for now (no real user traffic to protect yet, and DB migrations aren't safely rollback-able regardless of app-version tooling).

Watchtower is fully removed (repo + droplet), done only after the new path was proven via a real end-to-end run, same day.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate, natural fit for GitHub Environments) is still deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point (CT-log/identity tradeoff to flag again then).

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
