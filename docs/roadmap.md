# Roadmap — bystrek.dev

See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## In progress

Nothing currently in flight.

## MVP

Ship calendar as the first complete vertical slice — chat CRUD, an agenda view, and a daily digest push — plus the household removal that clears the way for it.

**Drop household.** Remove the `households` table and `household_id` FKs; `users` stands alone, `owner_id` + `visibility` (`private`/`shared`) is enough. A second household means a second instance/droplet/DB, not a second tenant on this one — see `docs/architecture.md`'s Auth section for the reasoning. Touches `api/src/household/`, the `better-auth` adapter/schema, the invite flow, and the `ui` admin page.

**Calendar source: Infomaniak kCalendar via CalDAV (decided).** Email, calendar, and drive are on Infomaniak kSuite, which exposes native, documented CalDAV. Sync connector talks generic CalDAV, so the calendar backend is just a URL/credentials swap if it ever needs to change again.

**Calendar CRUD via chat.** Expose the calendar as a tool in the backend's `@anthropic-ai/sdk` tool-call loop: create/read/update/delete, including recurring events. Auth uses an app-specific password generated from the kSuite account (required once 2FA is on). System prompt context: timezone (Warsaw), working hours, default calendar name.

**Agenda view.** New section in the custom app: browse the calendar, day by day.

**Daily agenda digest.** A scheduled job gathers each user's events for the day and publishes a job to **RabbitMQ**; a worker consumes it and sends a push — "Here's your agenda for today," linking to that day's agenda view. First real use of a message queue in this stack (see `docs/architecture.md`'s Layering section) — also the substrate the later, broader "Proactive nudging" item reuses instead of a second ad hoc cron job.

## Post-MVP

**Notes/research/medical/nutrition/gym domains.**
- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — no note-taking app in the current stack has an API. Options: a separate notes/reminders app with an actual API, plain Markdown files in a synced drive folder, or make note-taking native to the new app.
- Medical records: tier-2 encryption applies (see architecture doc).

**Proactive nudging (beyond the daily digest).**
- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`); the RabbitMQ scheduler/worker pattern from the MVP's daily digest is the substrate.
- Depends on the notes/research/etc. domains existing first — nothing to check in on otherwise.

**Signal Forms migration.** `login`, `main`'s invite form, `reset-password`, `profile`, and `chat`'s draft input (`ui`) all use manual `signal()` fields + `FormsModule`/`ngModel`. Migrate all of them together in one PR, not piecemeal, to avoid two form idioms coexisting.

## Done (historical record)

**Platform scaffold, deployed.** `api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (Angular, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR and deploys via a forced-command-restricted SSH key, gated by a GitHub Environment. Dockge (dashboard, loopback + SSH tunnel only) stays for visibility and manual overrides.

`households` and `users` tables (`api/src/db/schema.ts`) are live: a user belongs to one household, `status` (`invited`/`active`) tracks the invite-gated signup flow, `email` is unique (indexed), `household_id` is indexed and cascades on household delete. Doubles as `better-auth`'s user table. `bun run db:seed` inserts the household/first member.

Deferred, not part of this scaffold: `owner_id`/`visibility` on domain tables, tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls) — shape decided in `docs/architecture.md`.

**Testing infra.** `api` runs on Bun's native test runner (`bun:test`) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget.

Nice to have: `api`'s integration tests call `app.close()` bare at the end of each test rather than in `try`/`finally` — a failed assertion skips it, leaking the Nest app/DB handles for that test run. Low priority, hasn't caused a real problem yet.

**Deploy pipeline.** One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. Rollback tooling is out of scope for now. Tests also run on PRs, but aren't required to pass before merging.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point.

**Auth wiring.** `better-auth` is embedded in `api` (Drizzle adapter over the existing `users` table plus new `sessions`/`accounts`/`verifications` tables), email/password only, bearer tokens (`Authorization` header, not cookies), 90-day rolling session TTL. `disableSignUp: true` is the invite gate — a household member row must already exist before anyone can sign in. The admin plugin backs invite/list/ban/unban; `HouseholdController` (`api/src/household/`) exposes `POST /household/invite`, `POST /household/members/:id/ban`/`unban`, all admin-only, plus a now-guarded `GET /household`. Inviting a member reuses the regular forgot-password flow (Resend-delivered "set your password" email) rather than a separate invite-token mechanism — same pattern the seed script uses to get the owner their first password.

`ui` has a login page, a household member list with ban/unban and an invite form for admins, and `/auth/reset-password` handles both the invite and forgot-password links.

Confirmed on a real device: the installed PWA and Safari do *not* share `localStorage` on iOS. Doesn't matter here — `/auth/reset-password` only ever sets a new password, never a session, so there's nothing to hand off between the two. After a reset (or an invite), sign in fresh from wherever you actually want a session: the PWA itself for daily use.

**Chat foundation.** Backend: `POST /chat` sends a message, streams Claude's reply over SSE via the `@anthropic-ai/sdk` tool-call loop. Text only for v1, no per-tool widget rendering (deferred until a tool's results are genuinely hard to read as prose, not designed preemptively).

`messages` table: single continuous thread per user, not per-conversation — no "new chat" concept, so proactive nudging can later inject into an existing thread rather than starting a new one. Stores the full raw Claude message sequence, including `tool_use`/`tool_result` blocks, not a simplified transcript. First table to carry `owner_id`/`visibility` (`private`, no household-shared conversations) and tier-2 field encryption — calendar and later domains reuse the same pattern.

Context sent to Claude per request is a bounded recency window (last N messages/tokens), never the full stored history. Retrieval over older messages via `pgvector` is a later addition, only if the window proves insufficient in practice — no rolling summarization.

Frontend: `ui` is Angular (zoneless, standalone, esbuild/Vite builder) — DI, hierarchical service scoping, and enforced separation of concerns as compiler-backed patterns matter more here than framework popularity or minimal bundle size; zoneless removes the historical bundle/runtime cost that used to be the main counter-argument. Routed `/login`, `/` (push notify + household admin), `/profile`, and `/chat` (message list, input, SSE streaming) are all live.

**Image size limit on `update-user`.** A `databaseHooks.user.update.before` hook in `auth.config.ts` rejects an `image` payload over 280,000 chars (~210KB decoded, no decoding performed) (413), closing the gap where `/api/auth`'s bypass of Nest's `express.json()` body limit let a bearer-token holder push an arbitrarily large `image` straight past the UI's client-side downscale.

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency.
