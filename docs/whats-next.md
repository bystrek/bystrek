# What's Next — bystrek.dev

See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR and deploys via a forced-command-restricted SSH key, gated by a GitHub Environment (see item 3). Dockge (dashboard, loopback + SSH tunnel only) stays for visibility and manual overrides.

`households` and `users` tables (`api/src/db/schema.ts`) are also live: a user belongs to one household, `status` (`invited`/`active`) tracks the invite-gated signup flow, `email` is unique (indexed), `household_id` is indexed and cascades on household delete. Now doubles as `better-auth`'s user table (see item 4) rather than a separate one. `bun run db:seed` inserts the household/first member.

Deferred, not part of this scaffold: `owner_id`/`visibility` on domain tables, tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 5 (calendar) — auth (item 4) is done, so `owner_id`/`visibility` on domain tables now has a real user model to point at.

## 2. Done: testing infra

`api` runs on Bun's native test runner (`bun:test`) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget.

## 3. Done: deploy pipeline

One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. Rollback tooling is out of scope for now. Tests also run on PRs, but aren't required to pass before merging.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point.

## 4. Done: auth wiring

`better-auth` is embedded in `api` (Drizzle adapter over the existing `users` table plus new `sessions`/`accounts`/`verifications` tables), email/password only, bearer tokens (`Authorization` header, not cookies), 90-day rolling session TTL. `disableSignUp: true` is the invite gate — a household member row must already exist before anyone can sign in. The admin plugin backs invite/list/ban/unban; `HouseholdController` (`api/src/household/`) exposes `POST /household/invite`, `POST /household/members/:id/ban`/`unban`, all admin-only, plus a now-guarded `GET /household`. Inviting a member reuses the regular forgot-password flow (Resend-delivered "set your password" email) rather than a separate invite-token mechanism — same pattern the seed script uses to get the owner their first password.

`ui`'s front page has a login form, a household member list with ban/unban and an invite form for admins, and `/auth/reset-password` handles both the invite and forgot-password links.

Confirmed on a real device: the installed PWA and Safari do *not* share `localStorage` on iOS. Doesn't matter here — `/auth/reset-password` only ever sets a new password, never a session, so there's nothing to hand off between the two. After a reset (or an invite), sign in fresh from wherever you actually want a session: the PWA itself for daily use.

## 5. Calendar (first vertical slice)

- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password) as a sync connector — pulls into the Postgres-backed calendar table on a schedule, rather than calling iCloud live on every request.
- Expose it to the LLM as a tool in the backend API's own `@anthropic-ai/sdk` tool-call loop, calling the backend's own calendar routes directly.
- One custom-app view: browse calendar events.
- System prompt context: timezone (Warsaw), working hours, default calendar name.

## 6. Notes/research/medical/nutrition/gym domains

- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — iCloud Notes has no API. Options: a separate notes/reminders app with an actual API, plain Markdown files in an iCloud Drive folder, or make note-taking native to the new app.
- Medical records: tier-2 encryption applies (see architecture doc).

## 7. Proactive nudging

- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 5/6 existing first.

## Frontend migration: SvelteKit → Angular

Decided, not started — see [`docs/frontend-migration.md`](frontend-migration.md). Doesn't block auth wiring or anything else in this list.

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency.
