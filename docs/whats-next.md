# What's Next — bystrek.dev

Day four's scaffold is live (see below). Open WebUI is retired. `push-service` is fully removed — folded into `api`/`ui`, no trace left. See [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Done: scaffold the platform, deployed

`api` (NestJS + Drizzle + Bun, `api.bystrek.dev`) and `ui` (SvelteKit, `bystrek.dev`) are live on the droplet, verified with a real push notification through the full stack. GitHub Actions builds both to GHCR; Dockge (dashboard, manual pull-and-redeploy, loopback + SSH tunnel only) and Watchtower (label-scoped auto-redeploy) run the deploy. `push-service` is gone entirely: container, Caddy route, source directory, CI workflow, and its now-redundant SQLite data volume (real subscription data confirmed migrated to Postgres first) all removed.

Deferred, not part of this scaffold: household/user data model (`owner_id` + `visibility`), auth (`better-auth`, invite-gated passkeys + magic-link via Resend), tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls), and the chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) — shape of each already decided in `docs/architecture.md`. Anthropic API key (Console + billing) still needs confirming before chat work starts.

Next up: item 2 (calendar) is the first real vertical slice, and will need the auth + data model pieces above built alongside it.

## 2. Calendar (first vertical slice)

- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password) as a sync connector — pulls into the Postgres-backed calendar table on a schedule, rather than calling iCloud live on every request.
- Expose it to the LLM as a tool in the backend API's own `@anthropic-ai/sdk` tool-call loop, calling the backend's own calendar routes directly — no separate "Workspace Tool" translation layer (that was Open WebUI's model, not this one).
- One custom-app view: browse calendar events.
- System prompt context: timezone (Warsaw), working hours, default calendar name.

## 3. Notes/research/medical/nutrition/gym domains

- Follow the same vertical-slice pattern proven out with calendar.
- Notes/reminders source is still an open question — iCloud Notes has no API. Options: a separate notes/reminders app with an actual API, plain Markdown files in an iCloud Drive folder, or just make note-taking native to the new app (no external sync needed at all, unlike calendar).
- Medical records: tier-2 encryption applies (see architecture doc).

## 4. Proactive nudging

- The actual want: the assistant should be able to message *first* — checking in on something planned earlier, re-notifying until it's actually done.
- Delivery is already solved and verified (push, built into `api`/`ui`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 2/3 existing first — "did I do it" means checking real data.

## 5. Loose ends worth revisiting

- Confirm which DigitalOcean region the droplet actually landed in (Frankfurt or Amsterdam — wasn't pinned down explicitly).
- Consider whether the $12/mo droplet tier is enough once Postgres + the backend API + the custom app + Dockge + Watchtower are all running alongside Caddy.
- Cloudflare API token is currently sitting in `~/bystrek/.env` on the droplet — fine for now, but worth knowing it's there if the box is ever backed up/cloned.
- No backup strategy yet for the droplet or its Docker volumes — matters a lot more once Postgres holds real data (medical records included), not just cert data.
- `bystrek_open_webui_data` volume still exists on the droplet (old chat history from days two/three), unreferenced now that Open WebUI is removed — decide whether to keep or purge it.
