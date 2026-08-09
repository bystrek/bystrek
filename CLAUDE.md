# CLAUDE.md

Working conventions for this repo. See `README.md` for what the project is, `docs/architecture.md` for the target design and reasoning, and `docs/whats-next.md` for what's currently in flight.

## Docs style

Every `.md` file: short, concise, simple language, minimal words. State decisions, not the deliberation behind them — put reasoning/alternatives-considered narrative in devlog entries instead (see below).

Docs (everything except `devlog/`) describe the current stack only — no archeology. Don't mention what used to be there, what got removed, or what something was swapped from (e.g. "Watchtower removed" or "swapped X for Y" doesn't belong once X is just gone). Brief reasoning for why something is the way it is is fine, but never name alternatives that were considered and rejected (e.g. "a custom script" not "a custom script over Ansible/Kamal"). All of that — history, alternatives considered, why one thing beat another — belongs in devlog entries only.

## Devlog

Write a devlog entry per work session in `devlog/YYYY-MM-DD-day-NN.md` (sequential day number, not date-based numbering). Structure it like the existing entries: **Date/Goal** header, **What we decided** (with reasoning, not just conclusions), **What we actually built**, **Problems hit along the way (and the actual fixes)**, and a **Current state** or **Status** closer. Capture the *why* behind decisions (alternatives considered and rejected, and why) — that's the part that isn't recoverable from git history later.

## Docs upkeep

- `docs/whats-next.md` is a live punch list, not an archive — update it as items complete or plans change, don't just append.
- `docs/architecture.md` is a living direction doc — the target shape, not a snapshot of what's built. Update it when the direction actually changes (like the Open WebUI → custom app pivot), not on every feature that ships.
- `infra/` holds actual copies of the droplet's `docker-compose.yml`, `Caddyfile`, `Dockerfile`, and `deploy.sh` — manually synced via `scp`. `docker-compose.yml`/`Caddyfile`/`Dockerfile` are reference copies only, not deployed from this repo; `deploy.sh` is the exception — CI triggers it directly over SSH on every push to `main`, though updating the script itself still requires a manual `scp`. `infra/` is the source of truth for current infra config. Re-sync it (ask the user to `scp` fresh copies) whenever the droplet's config changes materially, and check new copies for literal secrets before committing (established pattern: secrets are referenced by env var name only, e.g. `env_file: .env`, `{env.CF_API_TOKEN}` — never by value).

## Secrets

Never commit secrets, `.env` files, API keys, or tokens to this repo. The established pattern is a `.env` file on the droplet itself (`~/bystrek/.env`, `chmod 600`) — API keys, VAPID keys, and similar all follow that pattern, referenced by name in docs/compose files but never by value.

## Identity and domain

`bystrek.dev` was deliberately chosen as a non-identifying domain — not the user's name or anything derivable from it. Certificate Transparency logs make any hostname a TLS cert is issued for permanently public, so don't introduce new subdomains, service names, or commit content that ties this project back to the user's real identity (name, exact address, etc.) without flagging the tradeoff first.

## No fabricated URLs

Don't invent or guess URLs (docs links, dashboard links, package pages) in commits, docs, or chat. Only use URLs the user has provided or that come from local files/tool output.

## Current architecture

`bystrek.dev` serves `ui` (SvelteKit: subscribe UI, service worker) and `api.bystrek.dev` serves `api` (NestJS + Drizzle + Bun: Postgres, push subscribe/send) — both real services, verified with a real push notification through the deployed stack. Chat, auth, and the data model beyond push subscriptions are still not built.

`docker-compose.yml`/`Caddyfile` (`~/bystrek/`) and Dockge's own compose file (`~/dockge/docker-compose.yml`) are managed by hand on the droplet and scp'd down to `infra/` as a reference copy only. Deploy is CI-triggered: GitHub Actions (`.github/workflows/deploy.yml`) builds `api`/`ui` to GHCR, then a `deploy` job — gated by a GitHub Environment (required reviewer) — SSHes in with a key restricted via a forced command (`authorized_keys`, can only run `infra/deploy.sh`) to `docker compose pull && up -d --remove-orphans`. Dockge stays for visibility and manual overrides.

Open WebUI and `push-service` are not part of this stack; check devlog before reintroducing either.

When the next major architectural shift lands, update this section, the README's status/architecture sections, and `docs/whats-next.md` together.
