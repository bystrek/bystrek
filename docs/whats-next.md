# What's Next — bystrek.dev

Push notifications work end-to-end (day three). Open WebUI is retired. `bystrek.dev` currently serves only `push-service`'s subscribe page. Day four begins the real build — see [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Day four: scaffold the platform

Per `docs/architecture.md`. Prerequisites to confirm first:
- Anthropic API key (Console + billing) — backend needs this to call Claude.
- Bun installed locally.

Immediate next steps:

- Backend stack decided: **NestJS + Drizzle + Bun** (see `docs/architecture.md`).
- Provision Postgres. Set up `api.bystrek.dev` — new DNS record, new Caddy site block, same DNS-01 pattern already in use.
- Scaffold the backend API: auth (`better-auth`, invite-gated passkeys + magic-link fallback), household/user data model (`owner_id` + `visibility`), CORS allowlist (`https://bystrek.dev` always, dev localhost only via env var), tier-2 field encryption (AES-256-GCM, app-level, wrapped manually around Drizzle calls).
- Scaffold the custom frontend (SvelteKit) at `bystrek.dev`: absorb `push-service`'s service worker/subscribe UI, chat UI via raw SSE from `@anthropic-ai/sdk` on the backend (no Vercel AI SDK), consumed with RxJS.
- Reduce `push-service` to notifications only: drop its public Caddy route entirely, called internally (`push-service:8787` on the Docker network) by the backend API.
- First vertical slice, full stack: **calendar** (item 2 below) — proves the whole pattern (data model → backend API → LLM tool → app view) before it's repeated for other domains.

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
- Delivery is already solved and verified (`push-service`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 2/3 existing first — "did I do it" means checking real data.

## 5. Loose ends worth revisiting

- Confirm which DigitalOcean region the droplet actually landed in (Frankfurt or Amsterdam — wasn't pinned down explicitly).
- Consider whether the $12/mo droplet tier is enough once Postgres + the backend API + the custom app are all running alongside `push-service` and Caddy.
- Cloudflare API token is currently sitting in `~/bystrek/.env` on the droplet — fine for now, but worth knowing it's there if the box is ever backed up/cloned.
- No backup strategy yet for the droplet or its Docker volumes — matters a lot more once Postgres holds real data (medical records included), not just cert data.
- `bystrek_open_webui_data` volume still exists on the droplet (old chat history from days two/three), unreferenced now that Open WebUI is removed — decide whether to keep or purge it.
