# What's Next — bystrek.dev

Push notifications work end-to-end (day three). Open WebUI is retired. `bystrek.dev` currently serves only `push-service`'s subscribe page. Day four begins the real build — see [`docs/architecture.md`](architecture.md) for design/reasoning; this file is the punch list.

## 1. Day four: scaffold the platform

Per `docs/architecture.md`. Build locally first, deploy after — WebAuthn and service workers both treat `localhost` as a secure context, so passkeys and push work without `api.bystrek.dev` existing yet.

Scope for today: auth (passkeys/magic-link/Resend) and tier-2 field encryption are **deferred** — no schema exists yet for either to protect. Today is scaffold + prove the stack talks to itself, locally and on the droplet. Deferred work, picked up once real domains exist: household/user data model (`owner_id` + `visibility`), auth (`better-auth`, invite-gated passkeys + magic-link via Resend), tier-2 field encryption (AES-256-GCM, wrapped manually around Drizzle calls) — shape of each already decided in `docs/architecture.md`.

Prerequisites to confirm first:
- Anthropic API key (Console + billing) — backend needs this to call Claude.
- Bun installed locally.
- Local Postgres (Docker, dev-only — separate from the droplet's compose).

Immediate next steps (local):

- Backend stack decided: **NestJS + Drizzle + Bun** (see `docs/architecture.md`).
- Scaffold the backend API: health endpoint; `subscriptions` table (Drizzle, replacing `push-service`'s SQLite) plus `/push/vapid-public-key`, `/push/subscribe`, `/push/send` ported over from `push-service`; migrations run automatically at container boot.
- Scaffold the custom frontend (SvelteKit): absorb `push-service`'s `index.html`/`sw.js`/touch-icon, keep the "Enable notifications" button, add a "Send test notification" button wired to `/push/send`.
- Local check: subscribe from a phone, hit the test-notification button, confirm a real push lands. Also retires the "shake down Bun+Drizzle+Postgres for real" risk noted in the runtime decision.
- CORS allowlist (`https://bystrek.dev` always, `http://localhost:5173` in dev via env var).

Then deploy:

- GitHub Actions for the new backend + frontend: build + push images to GHCR, same pattern as `push-service.yml`.
- Provision Postgres on the droplet. Set up `api.bystrek.dev` — new DNS record, new Caddy site block, same DNS-01 pattern already in use.
- Install **Dockge** (dashboard, logs, manual pull-and-redeploy) and **Watchtower** (label-scoped auto-redeploy on new image digest) on the droplet.
- Deploy both new services, re-run the test-notification check against the real droplet deploy.
- Flip `bystrek.dev`'s Caddy route from `push-service` to the new frontend. Retire the `push-service` container and its now-redundant CI workflow.
- Chat UI (raw SSE from `@anthropic-ai/sdk`, consumed with RxJS) and the calendar vertical slice (item 2) are **deferred to a later day** — today stops at a proven, deployed scaffold.

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
- Delivery is already solved and verified (push, now built into the backend/frontend rather than a separate `push-service`).
- Still needed: a lightweight scheduled job, independent of any reactive chat session, that periodically checks state via the backend API and fires a notification if something isn't done. Depends on items 2/3 existing first — "did I do it" means checking real data.

## 5. Loose ends worth revisiting

- Confirm which DigitalOcean region the droplet actually landed in (Frankfurt or Amsterdam — wasn't pinned down explicitly).
- Consider whether the $12/mo droplet tier is enough once Postgres + the backend API + the custom app + Dockge + Watchtower are all running alongside Caddy.
- Cloudflare API token is currently sitting in `~/bystrek/.env` on the droplet — fine for now, but worth knowing it's there if the box is ever backed up/cloned.
- No backup strategy yet for the droplet or its Docker volumes — matters a lot more once Postgres holds real data (medical records included), not just cert data.
- `bystrek_open_webui_data` volume still exists on the droplet (old chat history from days two/three), unreferenced now that Open WebUI is removed — decide whether to keep or purge it.
