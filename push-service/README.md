# push-service

Minimal self-hosted Web Push service, meant to sit at `bystrek.dev/push/*` (same origin as Open WebUI) so notification permission and PWA install stay unified — see `devlog/2026-08-07-day-03.md` for why (ntfy and a native app were both rejected).

**Status**: live at `https://bystrek.dev/push/*`, reachable over Tailscale. No client-side subscribe flow or Open WebUI tool yet — see `docs/whats-next.md` for the remaining steps.

## Deploy

`.github/workflows/push-service.yml` builds this service's `Dockerfile` and pushes `ghcr.io/bystrek/push-service:latest` (and `:<sha>`) to GHCR on every push to `push-service/**`. Deploy is a manual pull on the droplet (`docker compose pull push-service && docker compose up -d`), not automatic — considered wiring the workflow to SSH into the droplet directly, but that means a production-capable key sitting in GitHub Actions secrets, which is more than this project needs right now.

The GHCR package is **private** (fine-grained PATs don't support package permissions at all — confirmed by trying — so this uses a classic PAT with `read:packages` scope). The droplet authenticates via `GHCR_PULL_TOKEN` + `GHCR_USERNAME` in its `.env`, same pattern as everything else there.

On the droplet, `push-service` is wired into `docker-compose.yml` (`image: ghcr.io/bystrek/push-service:latest`, a `push_service_data` volume for the SQLite DB) and the Caddyfile routes `/push/*` to it while everything else stays on `open-webui`. See `infra/` in the repo root for the live config.

## Structure

Bun + [Hono](https://hono.dev) for routing (small, Bun-native, no other framework dependencies pulled in).

- `src/env.ts` — reads and validates required env vars at startup.
- `src/db.ts` — `bun:sqlite` subscriptions table and queries.
- `src/app.ts` — the Hono app: routes and their handlers.
- `src/index.ts` — entry point, just starts `Bun.serve` with the app.

## Endpoints

- `GET /push/vapid-public-key` — returns `{ publicKey }`, for the client to use with `pushManager.subscribe()`.
- `GET /push/sw.js` — serves the service worker (`public/sw.js`): handles `push` (shows a notification) and `notificationclick` (focuses/opens the app).
- `POST /push/subscribe` — body is a browser `PushSubscription.toJSON()` (`{ endpoint, keys: { p256dh, auth } }`). Upserts into SQLite, keyed by `endpoint`.
- `POST /push/send` — body `{ title?, message }`. Sends to every stored subscription via `web-push`; subscriptions that come back 404/410 (expired/unsubscribed) are pruned automatically. Returns `{ sent, removed, failed }`. This is what a future Open WebUI tool will call.

No auth on `/push/send` yet — the service is only ever reachable at all because `bystrek.dev` itself is Tailscale-only, so the trust boundary today is "on the tailnet." Revisit if that trust model ever changes.

## Local development

```
bun install
bun run generate-vapid   # prints a fresh VAPID keypair — paste into .env
cp .env.example .env     # then fill in the VAPID_* values
bun run dev
```

SQLite file is created at `DB_PATH` (default `./data/subscriptions.sqlite`), gitignored.

## Env vars

See `.env.example`. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are required at startup (the process throws immediately if any are missing). On the droplet these will live in `~/bystrek/.env`, same pattern as `CF_API_TOKEN` — never committed.
