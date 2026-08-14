# What's Next — bystrek.dev

See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR and deploys via a forced-command-restricted SSH key, gated by a GitHub Environment (see item 3). Dockge (dashboard, loopback + SSH tunnel only) stays for visibility and manual overrides.

`households` and `users` tables (`api/src/db/schema.ts`) are also live: a user belongs to one household, `status` (`invited`/`active`) tracks the invite-gated signup flow, `email` is unique (indexed), `household_id` is indexed and cascades on household delete. Shaped to double as `better-auth`'s user table later (`email`, `emailVerified`, `name`, `createdAt`/`updatedAt`) rather than needing a separate one. `GET /household` reads it (no auth yet, same trust level as `/push/*`) and the UI shows a household card; `bun run db:seed` inserts the household/first member.

Deferred, not part of this scaffold: auth itself (`better-auth` wiring — admin + magic-link plugins, invite-gated via admin-created user rows, sessions; passkey explicitly deferred past v1), `owner_id`/`visibility` on domain tables, tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 4 (auth wiring) — blocks everything after it, since `owner_id`/`visibility` on any domain table needs a real user model to point at.

## 2. Done: testing infra

`api` runs on Bun's native test runner (`bun:test`) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget.

## 3. Done: deploy pipeline

One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. Rollback tooling is out of scope for now. Tests also run on PRs, but aren't required to pass before merging.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point.

## 4. Auth wiring (blocks all other items)

Shape decided in `docs/architecture.md`; nothing built yet. Everything after this depends on a real user model (`owner_id`/`visibility` needs a real user to point at), so this comes before calendar.

- Install `better-auth` in `api`, Drizzle adapter pointed at the existing `users` table (already shaped for it).
- **Admin plugin**: `createUser` (invite = create the row directly, `status: invited`), `listUsers`, `banUser`/`unbanUser`.
- **Magic-link plugin**: `disableSignUp: true` (only an email with an existing row can get a session — this is the invite gate), Resend for delivery.
- Bearer-token session handling in the SvelteKit app: a verify route that exchanges the magic-link token for a session token and stores it client-side, rolling TTL (refresh on activity, inactivity cap).
- Auth guard on existing/new API routes — `GET /household` currently has none.
- Household management page: extend the existing household card with a member list + disable/enable button, calling the admin plugin's client methods. No separate admin console.
- Real-device check: confirm the installed PWA and Safari actually share storage for the same origin on iOS before trusting the magic-link-click-in-Safari → session-in-PWA path (flagged as open in the day-six devlog).

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
