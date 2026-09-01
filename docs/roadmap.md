# Roadmap — bystrek.dev

See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## In progress

Nothing currently in flight.

## UI bugs (post-brutalist pass)

Reported after PR #21 merged; not yet triaged for a fix session. Listed in priority order.

1. [#23](https://github.com/bystrek/bystrek/issues/23) — **Chat input field background.** The input's background feels heavy against the surrounding surface — try it with no background (transparent, blended with the container) instead.
2. [#24](https://github.com/bystrek/bystrek/issues/24) — **Viewport / zoom breaks out of bounds.** Something about the zoom/scale handling lets the app render outside its intended container — layout ends up looking messy. Repro conditions not pinned down yet; needs a look on a real device.
3. [#25](https://github.com/bystrek/bystrek/issues/25) — **Logo needs updating.** Current mark doesn't fit the brutalist visual direction.

## MVP

Ship calendar as the first complete vertical slice — chat CRUD, an agenda view, and a daily digest push.

**Calendar source: Infomaniak kCalendar via CalDAV (decided).** Email, calendar, and drive are on Infomaniak kSuite, which exposes native, documented CalDAV. Sync connector talks generic CalDAV, so the calendar backend is just a URL/credentials swap if it ever needs to change again.

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

`users` table (`api/src/db/schema.ts`) is live: `status` (`invited`/`active`) tracks the invite-gated signup flow, `email` is unique (indexed). Doubles as `better-auth`'s user table. `bun run db:seed` inserts the first (owner/admin) user.

Deferred, not part of this scaffold: `owner_id`/`visibility` on domain tables, tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls) — shape decided in `docs/architecture.md`.

**Testing infra.** `api` runs on Bun's native test runner (`bun:test`) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget.

Nice to have: `api`'s integration tests call `app.close()` bare at the end of each test rather than in `try`/`finally` — a failed assertion skips it, leaking the Nest app/DB handles for that test run. Low priority, hasn't caused a real problem yet.

**Deploy pipeline.** One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. Rollback tooling is out of scope for now. Tests also run on PRs, but aren't required to pass before merging.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point.

**Auth wiring.** `better-auth` is embedded in `api` (Drizzle adapter over the existing `users` table plus new `sessions`/`accounts`/`verifications` tables), email/password only, bearer tokens (`Authorization` header, not cookies), 90-day rolling session TTL. `disableSignUp: true` is the invite gate — a user row must already exist before anyone can sign in. The admin plugin backs invite/list/ban/unban; `UsersController` (`api/src/users/`) exposes `POST /users/invite`, `POST /users/:id/ban`/`unban`, all admin-only, plus a now-guarded `GET /users`. Inviting a user reuses the regular forgot-password flow (Resend-delivered "set your password" email) rather than a separate invite-token mechanism — same pattern the seed script uses to get the owner their first password.

`ui` has a login page, a user list with ban/unban and an invite form for admins, and `/auth/reset-password` handles both the invite and forgot-password links.

Confirmed on a real device: the installed PWA and Safari do *not* share `localStorage` on iOS. Doesn't matter here — `/auth/reset-password` only ever sets a new password, never a session, so there's nothing to hand off between the two. After a reset (or an invite), sign in fresh from wherever you actually want a session: the PWA itself for daily use.

**Chat foundation.** Backend: `POST /chat` sends a message, streams Claude's reply over SSE via the `@anthropic-ai/sdk` tool-call loop. Text only for v1, no per-tool widget rendering (deferred until a tool's results are genuinely hard to read as prose, not designed preemptively).

`messages` table: single continuous thread per user, not per-conversation — no "new chat" concept, so proactive nudging can later inject into an existing thread rather than starting a new one. Stores the full raw Claude message sequence, including `tool_use`/`tool_result` blocks, not a simplified transcript. First table to carry `owner_id`/`visibility` (`private`, no shared conversations) and tier-2 field encryption — calendar and later domains reuse the same pattern.

Context sent to Claude per request is a bounded recency window (last N messages/tokens), never the full stored history. Retrieval over older messages via `pgvector` is a later addition, only if the window proves insufficient in practice — no rolling summarization.

Frontend: `ui` is Angular (zoneless, standalone, esbuild/Vite builder) — DI, hierarchical service scoping, and enforced separation of concerns as compiler-backed patterns matter more here than framework popularity or minimal bundle size; zoneless removes the historical bundle/runtime cost that used to be the main counter-argument. Routed `/login`, `/` (push notify + user admin), `/profile`, and `/chat` (message list, input, SSE streaming) are all live.

**Image size limit on `update-user`.** A `databaseHooks.user.update.before` hook in `auth.config.ts` rejects an `image` payload over 280,000 chars (~210KB decoded, no decoding performed) (413), closing the gap where `/api/auth`'s bypass of Nest's `express.json()` body limit let a bearer-token holder push an arbitrarily large `image` straight past the UI's client-side downscale.

**Drop household.** Removed the `households` table and `household_id` FK; `users` stands alone, `owner_id`/`visibility` (`private`/`shared`) is enough — a second household gets its own instance/droplet/DB, not a second tenant on this one (see `docs/architecture.md`'s Auth section). `api/src/household/` renamed to `api/src/users/`; routes moved from `/household`, `/household/invite`, `/household/members/:id/ban`/`unban` to `/users`, `/users/invite`, `/users/:id/ban`/`unban`. `ui`'s household admin UI became a flat user list.

**Calendar CRUD via chat.** `api/src/calendar/`: `calendar_credentials` table (one CalDAV account per user, `password` tier-2 encrypted via the existing `field-encryption` wrapper), a `tsdav`-backed `CalendarService` talking to Infomaniak kCalendar (list/create/update/delete), and `ical.js` for building/parsing RRULE-bearing event bodies — recurrence expansion itself is the CalDAV server's job, not client-side (see devlog day 12). Five tools (`list_calendar_events`, `propose_create_calendar_event`/`propose_update_calendar_event`/`propose_delete_calendar_event`, `confirm_calendar_action`) registered into the chat tool-call loop; `CHAT_TOOLS` is now assembled from per-domain tool providers (calendar is the first) rather than a static empty array, and `ChatTool.handler` gained a `ToolContext` (`userId` + a per-chat-request `requestId`) so a tool can scope its work to the requesting user and, for calendar's mutating tools, enforce confirmation in a genuinely separate turn. `ui`'s profile page gained a Calendar settings section (CalDAV URL/username/app-specific password, a "Load calendars" step that connects with the not-yet-saved credentials and populates a dropdown of the account's real calendars) — verified live in a browser (save, reload-persists, disconnect). The selected calendar is identified by its own stable, server-assigned URL (`calendar_credentials.calendarUrl`), not a retyped display name — `calendarDisplayName` is a cached label for display only. Full CRUD verified against the real Infomaniak account: read (19 real events fetched and parsed, 0 failures) and a live create → update → delete round-trip against a throwaway test event, all cleaned up after. The calendar settings form is generic CalDAV (no Infomaniak-specific copy or defaults) — worth remembering that Infomaniak's CalDAV **username** is the short login ID from `config.infomaniak.com`'s sync assistant (e.g. `AB12345`), not the account email, if setup ever needs revisiting. `users.timezone`/`users.locale` (default `Europe/Warsaw`/`en-PL`) feed the chat system prompt's current-date/time context and are also applied to calendar event times themselves — `list_calendar_events`/`propose_update_calendar_event`/`propose_delete_calendar_event` return event start/end already formatted in the user's timezone with an explicit UTC offset (`api/src/calendar/zoned-time.ts`), not raw UTC left for the model to convert (see devlog day 12). No settings UI yet, editable only via direct DB access; working-hours context is still missing entirely. Mutating tools (`propose_create_calendar_event`/`propose_update_calendar_event`/`propose_delete_calendar_event`) stage the change and require a `confirm_calendar_action` call in a later chat turn to execute, per `docs/architecture.md`'s write-safety requirement — `list_calendar_events` stays direct (read-only).

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency.
