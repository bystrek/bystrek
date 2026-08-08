# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with an LLM (Claude) that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev` — reachable only over Tailscale, not the public internet.

## Status

Infra is live; the platform itself hasn't been built yet. Chat is currently **offline** — Open WebUI was used through day three but has been retired (see `docs/architecture.md`'s "why not Open WebUI" section); the custom app that replaces it (chat included) starts day four. See [`docs/whats-next.md`](docs/whats-next.md) for the current punch list and [`devlog/`](devlog/) for how we got here, session by session.

**Working today:**
- A DigitalOcean droplet, locked down to SSH-only on its public IP, reachable everywhere else only over a private Tailscale mesh.
- `bystrek.dev` resolves to the droplet's Tailscale IP (Cloudflare DNS, not proxied) with a real Let's Encrypt cert issued via DNS-01 — no ports 80/443 exposed publicly, ever.
- Push notifications: [`push-service/`](push-service/) (Bun + Hono) — backend and subscribe flow both verified end-to-end (a real push landed on an iPhone lock screen, day three). Currently also serves `bystrek.dev` root as a minimal subscribe page, standing in until the custom app takes over that role.

**Not built yet:**
- The custom app itself (chat + browsing/visualization), backend API, Postgres-backed data model, auth — see `docs/architecture.md` for the plan.
- The iCloud Calendar tool (CalDAV) — planned as the platform's first vertical slice.
- Notes/research/medical/nutrition/gym domains.
- Proactive nudging (the assistant messaging first, not just replying).

## Architecture

Current (transitional, day three): `bystrek.dev` → Caddy → `push-service` (subscribe page + push backend). No chat.

Target (day four on): `bystrek.dev` → Caddy → custom app (chat + browsing); `api.bystrek.dev` → backend API (Postgres, auth); `push-service` reduced to notifications only, internal-only. Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Tailscale only. The droplet's public IP allows inbound SSH and nothing else — no public HTTP/HTTPS surface at all.
- **TLS**: Caddy, built with the Cloudflare DNS plugin (`xcaddy`), gets certs via DNS-01 so no inbound port 80/443 is ever needed.
- **Domain**: `bystrek.dev` is an invented, non-identifying name (deliberately not the user's surname — Certificate Transparency logs are public, so a personal domain on an assistant with calendar access would be a phishing gift).

Full raw facts (IPs, versions, file layout on the droplet) are in [`docs/technical-trace.md`](docs/technical-trace.md) — note it's a snapshot from day one and hasn't been kept current since.

## Repo layout

```
.github/       CI workflows (builds push-service's image to GHCR)
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
devlog/        Session-by-session build log — what was decided, what was built, what broke
docs/          technical-trace.md (infra snapshot) and whats-next.md (live punch list)
infra/         Manually-synced copies of what's actually running on the droplet
push-service/  Bun Web Push microservice (subscribe/send endpoints) — see its own README
```

## Infra snapshot

[`infra/`](infra/) holds the actual `docker-compose.yml`, `Caddyfile`, and `Dockerfile` running on the droplet — pulled down periodically for reference, not deployed from here. See [`infra/README.md`](infra/README.md) for the sync model. It's a better source of truth than `docs/technical-trace.md`, which is prose and has already drifted.

## Secrets

Nothing here. `CF_API_TOKEN`, `GHCR_PULL_TOKEN`/`GHCR_USERNAME` (private GHCR package pull auth), and `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` all live in `~/bystrek/.env` on the droplet (chmod 600), never in git.
