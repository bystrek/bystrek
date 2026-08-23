# What's Next — bystrek.dev

See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (Angular, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR and deploys via a forced-command-restricted SSH key, gated by a GitHub Environment (see item 3). Dockge (dashboard, loopback + SSH tunnel only) stays for visibility and manual overrides.

`households` and `users` tables (`api/src/db/schema.ts`) are also live: a user belongs to one household, `status` (`invited`/`active`) tracks the invite-gated signup flow, `email` is unique (indexed), `household_id` is indexed and cascades on household delete. Now doubles as `better-auth`'s user table (see item 4) rather than a separate one. `bun run db:seed` inserts the household/first member.

Deferred, not part of this scaffold: `owner_id`/`visibility` on domain tables, tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`.

Next up: item 5's last piece — a routed chat page in `ui`, wired to the `POST /chat` backend that's already live.

## 2. Done: testing infra

`api` runs on Bun's native test runner (`bun:test`) — unit tests for pure logic, integration tests against a real local Postgres with each test wrapped in a transaction rolled back afterward. `ui` uses Vitest for unit/component logic and Playwright (WebKit only, matching the iOS Safari target) for e2e. `deploy.yml` gates the Docker build/push behind a test job for each service, comfortably under a 10-minute budget.

Nice to have: `api`'s integration tests call `app.close()` bare at the end of each test rather than in `try`/`finally` — a failed assertion skips it, leaking the Nest app/DB handles for that test run. Low priority, hasn't caused a real problem yet.

## 3. Done: deploy pipeline

One workflow (`.github/workflows/deploy.yml`) tests and builds `api`/`ui` on any push touching either, then a single `deploy` job — gated by a GitHub Environment (`production`: required reviewer, `main`-branch only) — SSHes into the droplet and runs `infra/deploy.sh` (`docker compose pull && up -d --remove-orphans`, whole stack, both services always together). The credential is a dedicated key restricted via a forced command in the droplet's `authorized_keys` (`no-pty`/`no-port-forwarding`/`no-agent-forwarding`) — it can only ever run that one script, nothing else. Rollback tooling is out of scope for now. Tests also run on PRs, but aren't required to pass before merging.

Dev/prod split (auto-deploy on every `main` push; prod only via tagged release + manual gate) is deliberately deferred until real features exist to protect. Shared droplet, not a second one, when it happens; `bystrek.dev` stays prod's address, a new subdomain gets picked for dev at that point.

## 4. Done: auth wiring

`better-auth` is embedded in `api` (Drizzle adapter over the existing `users` table plus new `sessions`/`accounts`/`verifications` tables), email/password only, bearer tokens (`Authorization` header, not cookies), 90-day rolling session TTL. `disableSignUp: true` is the invite gate — a household member row must already exist before anyone can sign in. The admin plugin backs invite/list/ban/unban; `HouseholdController` (`api/src/household/`) exposes `POST /household/invite`, `POST /household/members/:id/ban`/`unban`, all admin-only, plus a now-guarded `GET /household`. Inviting a member reuses the regular forgot-password flow (Resend-delivered "set your password" email) rather than a separate invite-token mechanism — same pattern the seed script uses to get the owner their first password.

`ui` has a login page, a household member list with ban/unban and an invite form for admins, and `/auth/reset-password` handles both the invite and forgot-password links.

Confirmed on a real device: the installed PWA and Safari do *not* share `localStorage` on iOS. Doesn't matter here — `/auth/reset-password` only ever sets a new password, never a session, so there's nothing to hand off between the two. After a reset (or an invite), sign in fresh from wherever you actually want a session: the PWA itself for daily use.

## 5. Chat foundation

- Backend: `POST /chat` — sends a message, streams Claude's reply over SSE via the `@anthropic-ai/sdk` tool-call loop. Text only for v1, no per-tool widget rendering (deferred until a tool's results are genuinely hard to read as prose, not designed preemptively).
- `messages` table: single continuous thread per user, not per-conversation — no "new chat" concept, so item 8's proactive nudging can inject into an existing thread rather than starting a new one. Stores the full raw Claude message sequence, including `tool_use`/`tool_result` blocks, not a simplified transcript. First table to carry `owner_id`/`visibility` (`private`, no household-shared conversations) and tier-2 field encryption — calendar (item 6) and later domains reuse the same pattern.
- Context sent to Claude per request is a bounded recency window (last N messages/tokens), never the full stored history. Retrieval over older messages via `pgvector` is a later addition, only if the window proves insufficient in practice — no rolling summarization.
- Frontend: `ui` is now Angular (zoneless, standalone, esbuild/Vite builder) — see [`docs/frontend-migration.md`](frontend-migration.md). Routed `/login` and `/` (push notify + household admin) are live; still needed: a routed chat page + chat component consuming the SSE stream, wired to the backend above.

## 6. Calendar (first vertical slice)

- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password) as a sync connector — pulls into the Postgres-backed calendar table on a schedule, rather than calling iCloud live on every request.
- Expose it to the LLM as a tool in the backend API's own `@anthropic-ai/sdk` tool-call loop (item 5), calling the backend's own calendar routes directly.
- One custom-app view: browse calendar events.
- System prompt context: timezone (Warsaw), working hours, default calendar name.

## 7. Notes/research/medical/nutrition/gym domains

- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — iCloud Notes has no API. Options: a separate notes/reminders app with an actual API, plain Markdown files in an iCloud Drive folder, or make note-taking native to the new app.
- Medical records: tier-2 encryption applies (see architecture doc).

## 8. Proactive nudging

- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 6/7 existing first.

## Frontend migration: SvelteKit → Angular

Done for everything except chat (item 5's last piece). `ui` re-ports login, push notify, and household admin on Angular (zoneless, standalone, esbuild/Vite builder, CSR-only) — see [`docs/frontend-migration.md`](frontend-migration.md). `docs/architecture.md`'s "Frontend & chat" section and the README's status section still describe the old SvelteKit setup; update both once the chat page lands and the migration is fully done, per `frontend-migration.md`'s own note.

## 9. Signal Forms migration

`login`, `main`'s invite form, `reset-password`, and `profile` (`ui`) all use manual `signal()` fields + `FormsModule`/`ngModel`. Angular 22 made Signal Forms stable — migrate all four forms together in one PR, not piecemeal, to avoid two form idioms coexisting.

## 10. Done: image size limit on `update-user`

A `databaseHooks.user.update.before` hook in `auth.config.ts` rejects an `image` payload over 280,000 chars (~210KB decoded, no decoding performed) (413), closing the gap where `/api/auth`'s bypass of Nest's `express.json()` body limit let a bearer-token holder push an arbitrarily large `image` straight past the UI's client-side downscale.

## Unrelated: media server

Personal project, not part of this product — see [`docs/media-server.md`](media-server.md). Far-future, no urgency.
