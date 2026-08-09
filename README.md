# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with an LLM (Claude) that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev` — reachable only over Tailscale, not the public internet.

## Status

Backend and frontend scaffolds are live on the droplet. Chat is currently **offline** — Open WebUI was used through day three but has been retired (see `docs/architecture.md`'s "why not Open WebUI" section); the custom app that replaces it is scaffolded but chat itself is deferred to a later day. See [`docs/whats-next.md`](docs/whats-next.md) for the current punch list and [`devlog/`](devlog/) for how we got here, session by session.

**Working today:**
- A DigitalOcean droplet, locked down to SSH-only on its public IP, reachable everywhere else only over a private Tailscale mesh.
- `bystrek.dev` and `api.bystrek.dev` both resolve to the droplet's Tailscale IP (Cloudflare DNS, not proxied) with real Let's Encrypt certs issued via DNS-01 — no ports 80/443 exposed publicly, ever.
- `ui/` (SvelteKit) at `bystrek.dev`: subscribe UI + service worker, "send test notification" button.
- `api/` (NestJS + Drizzle + Bun) at `api.bystrek.dev`: Postgres-backed subscriptions table, push subscribe/send endpoints. Verified end to end — a real push landed on a device via the deployed stack.
- Deploy pipeline: GitHub Actions builds `api`/`ui` images to GHCR, then redeploys over SSH with a key restricted to a single forced command, gated by a GitHub Environment (required reviewer). **Dockge** (dashboard, loopback-only, SSH-tunnel access) stays for visibility and manual overrides; Watchtower has been removed.

**Not built yet:**
- Auth (invite-gated passkeys + magic-link), tier-2 field encryption — deferred until real domains/schemas exist.
- Chat UI, the iCloud Calendar tool (CalDAV) — planned as the platform's first vertical slice.
- Notes/research/medical/nutrition/gym domains.
- Proactive nudging (the assistant messaging first, not just replying).

## Architecture

Current (day four): `bystrek.dev` → Caddy → `ui` (SvelteKit: subscribe UI + service worker); `api.bystrek.dev` → Caddy → `api` (NestJS: Postgres, push send/subscribe). `push-service` is retired — its logic was folded into `api`/`ui` rather than kept as a separate service. No chat yet. Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Tailscale only. The droplet's public IP allows inbound SSH and nothing else — no public HTTP/HTTPS surface at all.
- **TLS**: Caddy, built with the Cloudflare DNS plugin (`xcaddy`), gets certs via DNS-01 so no inbound port 80/443 is ever needed.
- **Domain**: `bystrek.dev` is an invented, non-identifying name (deliberately not the user's surname — Certificate Transparency logs are public, so a personal domain on an assistant with calendar access would be a phishing gift).

Full raw facts (IPs, versions, file layout on the droplet) are in [`docs/technical-trace.md`](docs/technical-trace.md) — note it's a snapshot from day one and hasn't been kept current since.

## Repo layout

```
.github/       CI workflows (builds api/ and ui/ images to GHCR)
api/           NestJS + Drizzle + Bun backend — Postgres, push subscribe/send
ui/            SvelteKit frontend — subscribe UI, service worker
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
devlog/        Session-by-session build log — what was decided, what was built, what broke
docs/          technical-trace.md (infra snapshot) and whats-next.md (live punch list)
infra/         Manually-synced copies of what's actually running on the droplet
```

## Infra snapshot

[`infra/`](infra/) holds the actual `docker-compose.yml`, `Caddyfile`, and `Dockerfile` running on the droplet — pulled down periodically for reference, not deployed from here. See [`infra/README.md`](infra/README.md) for the sync model. It's a better source of truth than `docs/technical-trace.md`, which is prose and has already drifted.

## Secrets

Nothing here. `CF_API_TOKEN`, `GHCR_PULL_TOKEN`/`GHCR_USERNAME` (private GHCR package pull auth), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, and `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`/`DATABASE_URL` all live in `~/bystrek/.env` on the droplet (chmod 600), never in git.
