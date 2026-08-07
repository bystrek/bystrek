# bystrek

A self-hosted personal AI assistant, built around Claude, that can eventually manage a calendar, take notes, send push notifications, and nudge proactively instead of only responding when spoken to.

`https://bystrek.dev` — reachable only over Tailscale, not the public internet.

## Status

Infra and chat are live. Everything past that is in progress — see [`docs/whats-next.md`](docs/whats-next.md) for the current punch list and [`devlog/`](devlog/) for how we got here, session by session.

**Working today:**
- A DigitalOcean droplet, locked down to SSH-only on its public IP, reachable everywhere else only over a private Tailscale mesh.
- `bystrek.dev` resolves to the droplet's Tailscale IP (Cloudflare DNS, not proxied) with a real Let's Encrypt cert issued via DNS-01 — no ports 80/443 exposed publicly, ever.
- [Open WebUI](https://github.com/open-webui/open-webui) as the chat frontend, connected to Claude via Anthropic's OpenAI-compatible `/v1/chat/completions` endpoint.
- Push notification backend: [`push-service/`](push-service/) (Bun + Hono) is live at `bystrek.dev/push/*`, built by CI into a private GHCR image and manually pulled onto the droplet. See day three's devlog for why we rejected ntfy and a native app in favor of this.

**In progress:**
- Push notifications, client side: no subscribe flow on the page yet, and no Open WebUI tool wired up to call `/push/send`. The backend works (verified with curl) but nothing triggers a real push yet.

**Not built yet:**
- The iCloud Calendar tool (CalDAV).
- Notes/reminders integration (no decision made yet — iCloud Notes has no API).
- Proactive nudging (the assistant messaging first, not just replying).

## Architecture

```
Mac / iPhone (Tailscale) ──▶ bystrek.dev ──▶ Caddy (TLS, reverse proxy) ──▶ Open WebUI ──▶ Claude API
```

- **Access**: Tailscale only. The droplet's public IP allows inbound SSH and nothing else — no public HTTP/HTTPS surface at all.
- **TLS**: Caddy, built with the Cloudflare DNS plugin (`xcaddy`), gets certs via DNS-01 so no inbound port 80/443 is ever needed.
- **Chat**: Open WebUI, backed by a persistent Docker volume, talks to Claude through an OpenAI-type connection (Chat Completions, not Responses — Anthropic's compat layer doesn't implement Responses).
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
