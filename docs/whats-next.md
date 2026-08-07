# What's Next — bystrek.dev

Infra is done, and as of day two, Open WebUI is deployed and connected to Claude — `https://bystrek.dev` is a working chat UI, reachable only over Tailscale. See `day-two.md` for how that was done. Pick up here:

## 1. Push notifications — target: chat on Mac → push on phone
**Goal**: open `https://bystrek.dev` on macOS, tell the chat to send a notification, and see it land as a push notification on the iPhone (and optionally the Mac too).

Superseded the original ntfy plan — see `devlog/2026-08-07-day-03.md` for why (ntfy can't be reverse-proxied under a subpath and a native app is strictly worse than iOS Web Push). Landed on a self-hosted Web Push service, same origin as Open WebUI. Status:

- ✅ `push-service/` (Bun + Hono): `/push/subscribe`, `/push/send`, `/push/vapid-public-key`, `/push/sw.js`. Runs locally, smoke-tested.
- ✅ Dockerfile, builds and runs correctly (verified locally).
- ✅ CI: `.github/workflows/push-service.yml` builds and pushes the image to GHCR on every push to `push-service/**`. Deploy is manual pull, not auto — see `devlog` for why (decided against auto-deploy for now; it'd mean either a production SSH key sitting in GitHub Actions secrets, or a poller service, both more than this project needs yet).
- ⬜ Decide GHCR package visibility (public — image has no baked-in secrets — vs. private + pull token on the droplet).
- ⬜ Generate a **real** production VAPID keypair (`bun run generate-vapid`) — the one in local `.env` is a throwaway dev key, don't reuse it.
- ⬜ Add a `push-service` block to the droplet's `docker-compose.yml`, referencing the GHCR image (`image:`, not `build:`), with a volume for the SQLite data and an `env_file` section for the VAPID keys in the droplet's `.env`.
- ⬜ Extend the Caddyfile: route `/push/*` to `push-service`, everything else stays on `open-webui:8080`.
- ⬜ Client-side subscribe flow: a small page/script under `bystrek.dev` that requests notification permission and calls `pushManager.subscribe()`.
- ⬜ Add `bystrek.dev` to the iPhone home screen (if not already), grant notification permission, confirm a subscription lands in the service's SQLite DB.
- ⬜ Open WebUI **Workspace Tool**: `send_notification(message)` — POSTs to `/push/send`.
- ⬜ Flip **Function Calling** to **Native** on the `claude-sonnet-5` model's advanced params (flagged since day two, still not done).
- ⬜ End-to-end test: ask Claude in chat to send a notification, confirm it lands on the iPhone lock screen.

## 2. Build the iCloud Calendar tool
- Generate an app-specific password at appleid.apple.com (Security → App-Specific Passwords) — the real Apple password won't work here.
- Use the `caldav` Python library against `caldav.icloud.com` (HTTPS, Basic Auth with Apple ID email + app-specific password).
- Write it as an Open WebUI Workspace Tool: functions like `list_events(start, end)`, `create_event(...)`, `find_free_slots(date)`, `delete_event(id)` — Claude reads the docstrings to decide when to call them.
- Store the app-specific password as an Open WebUI "Valve" (tool config secret), not hardcoded in the script.
- Give the assistant a system prompt with timezone (Warsaw), working hours, and default calendar name.

## 3. Decide on notes/reminders
- Deferred earlier — iCloud Notes has no API at all. Options still open:
  - A separate notes/reminders app with an actual API (evaluate options).
  - Plain Markdown files in an iCloud Drive folder (works from a VPS, no AppleScript needed).
  - AppleScript automation, but that requires running natively on the Mac, not the VPS — likely off the table now that hosting moved to DigitalOcean.

## 4. Proactive nudging
- The actual want: the assistant should be able to message *first* — e.g. checking in on something planned earlier in the week, and re-notifying until it's actually done — not just respond when a chat is opened.
- Delivery (ntfy, self-hosted) is handled by item 1 above, including action buttons (e.g. "Mark done ✅") that can hit a callback URL directly from the notification, letting you close the loop without going back into chat.
- Still needed: (a) a lightweight **scheduled job** on the droplet, independent of the reactive Open WebUI chat, that periodically checks state and fires a notification if something isn't done; (b) **task state to check against** — which is why this sits after items 2 and 3 above, since "did I do it" ultimately means checking the calendar tool or whatever notes/reminders solution gets picked.

## 5. Loose ends worth revisiting
- Confirm which DigitalOcean region the droplet actually landed in (Frankfurt or Amsterdam — wasn't pinned down explicitly).
- Consider whether the $12/mo droplet tier is more than needed once the real workload (Open WebUI + tool calls, no local inference) is running — DigitalOcean droplets can be resized down.
- Cloudflare API token is currently sitting in `~/bystrek/.env` on the droplet — fine for now, but worth knowing it's there if the box is ever backed up/cloned.
- No backup strategy yet for the droplet or its Docker volumes — now includes the new `open_webui_data` volume (chat history, connection config), not just Caddy's cert data.
