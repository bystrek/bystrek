# CLAUDE.md

Working conventions for this repo. See `README.md` for what the project is and `docs/whats-next.md` for what's currently in flight.

## Devlog

Write a devlog entry per work session in `devlog/YYYY-MM-DD-day-NN.md` (sequential day number, not date-based numbering). Structure it like the existing entries: **Date/Goal** header, **What we decided** (with reasoning, not just conclusions), **What we actually built**, **Problems hit along the way (and the actual fixes)**, and a **Current state** or **Status** closer. Capture the *why* behind decisions (alternatives considered and rejected, and why) — that's the part that isn't recoverable from git history later.

## Docs upkeep

- `docs/whats-next.md` is a live punch list, not an archive — update it as items complete or plans change, don't just append.
- `docs/technical-trace.md` is a point-in-time infra snapshot (as of day one) and has already drifted from reality (e.g. DO region was never pinned down). Don't treat it as current without checking; update it when infra changes materially, but it's not required to be perfectly live.
- `infra/` holds actual copies of the droplet's `docker-compose.yml`, `Caddyfile`, and `Dockerfile` — manually synced via `scp`, not deployed from this repo. It's the more reliable source of truth for current infra config; prefer it over `docs/technical-trace.md` when they disagree. Re-sync it (ask the user to `scp` fresh copies) whenever the droplet's config changes materially, and check new copies for literal secrets before committing (established pattern: secrets are referenced by env var name only, e.g. `env_file: .env`, `{env.CF_API_TOKEN}` — never by value).

## Secrets

Never commit secrets, `.env` files, API keys, or tokens to this repo. The established pattern is a `.env` file on the droplet itself (`~/bystrek/.env`, `chmod 600`) — API keys, VAPID keys, and similar all follow that pattern, referenced by name in docs/compose files but never by value.

## Identity and domain

`bystrek.dev` was deliberately chosen as a non-identifying domain — not the user's name or anything derivable from it. Certificate Transparency logs make any hostname a TLS cert is issued for permanently public, so don't introduce new subdomains, service names, or commit content that ties this project back to the user's real identity (name, exact address, etc.) without flagging the tradeoff first.

## No fabricated URLs

Don't invent or guess URLs (docs links, dashboard links, package pages) in commits, docs, or chat. Only use URLs the user has provided or that come from local files/tool output.

## Current architecture (as of day three)

Chat: Open WebUI → Caddy (TLS + reverse proxy) → droplet, reachable only over Tailscale. Infra is still managed by hand on the droplet (`~/bystrek/docker-compose.yml`, `Caddyfile`), not deployed from this repo — `infra/` is a synced reference copy only, not a deploy source.

`push-service/` (Bun) is this repo's first application code: a Web Push microservice meant to run at `bystrek.dev/push/*`, same origin as Open WebUI. It's scaffolded and runnable locally (`bun install && bun run dev`) but not yet deployed — no Dockerfile, no droplet compose/Caddy wiring, no client subscribe flow. When any of that lands, update this section, the README's repo-layout section, and `docs/whats-next.md` together.
