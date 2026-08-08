# CLAUDE.md

Working conventions for this repo. See `README.md` for what the project is, `docs/architecture.md` for the target design and reasoning, and `docs/whats-next.md` for what's currently in flight.

## Docs style

Every `.md` file: short, concise, simple language, minimal words. State decisions, not the deliberation behind them — put reasoning/alternatives-considered narrative in devlog entries instead (see below).

## Devlog

Write a devlog entry per work session in `devlog/YYYY-MM-DD-day-NN.md` (sequential day number, not date-based numbering). Structure it like the existing entries: **Date/Goal** header, **What we decided** (with reasoning, not just conclusions), **What we actually built**, **Problems hit along the way (and the actual fixes)**, and a **Current state** or **Status** closer. Capture the *why* behind decisions (alternatives considered and rejected, and why) — that's the part that isn't recoverable from git history later.

## Docs upkeep

- `docs/whats-next.md` is a live punch list, not an archive — update it as items complete or plans change, don't just append.
- `docs/architecture.md` is a living direction doc — the target shape, not a snapshot of what's built. Update it when the direction actually changes (like the Open WebUI → custom app pivot), not on every feature that ships.
- `docs/technical-trace.md` is a point-in-time infra snapshot (as of day one) and has already drifted from reality (e.g. DO region was never pinned down). Don't treat it as current without checking; update it when infra changes materially, but it's not required to be perfectly live.
- `infra/` holds actual copies of the droplet's `docker-compose.yml`, `Caddyfile`, and `Dockerfile` — manually synced via `scp`, not deployed from this repo. It's the more reliable source of truth for current infra config; prefer it over `docs/technical-trace.md` when they disagree. Re-sync it (ask the user to `scp` fresh copies) whenever the droplet's config changes materially, and check new copies for literal secrets before committing (established pattern: secrets are referenced by env var name only, e.g. `env_file: .env`, `{env.CF_API_TOKEN}` — never by value).

## Secrets

Never commit secrets, `.env` files, API keys, or tokens to this repo. The established pattern is a `.env` file on the droplet itself (`~/bystrek/.env`, `chmod 600`) — API keys, VAPID keys, and similar all follow that pattern, referenced by name in docs/compose files but never by value.

## Identity and domain

`bystrek.dev` was deliberately chosen as a non-identifying domain — not the user's name or anything derivable from it. Certificate Transparency logs make any hostname a TLS cert is issued for permanently public, so don't introduce new subdomains, service names, or commit content that ties this project back to the user's real identity (name, exact address, etc.) without flagging the tradeoff first.

## No fabricated URLs

Don't invent or guess URLs (docs links, dashboard links, package pages) in commits, docs, or chat. Only use URLs the user has provided or that come from local files/tool output.

## Current architecture (as of day four, end of session)

Open WebUI has been retired — removed from the droplet's `docker-compose.yml`, container and image deleted. Its data volume (`bystrek_open_webui_data`, old chat history) was left intact but unreferenced rather than deleted, in case it's ever wanted; nothing currently points at it. Don't reintroduce Open WebUI without revisiting `docs/architecture.md`'s reasoning for why it was dropped.

`push-service` has been retired and fully removed (unlike Open WebUI, no volume was left behind — its data was a redundant copy of what's now in Postgres, confirmed migrated before deletion): source directory deleted, container removed, `bystrek_push_service_data` volume deleted, CI workflow deleted. Its logic (VAPID subscribe/send, `sw.js`) was ported into `api`/`ui` rather than kept as a separate service — don't reintroduce it as a standalone service without revisiting that reasoning (`devlog/2026-08-08-day-04.md`).

`bystrek.dev` now serves `ui` (SvelteKit: subscribe UI, service worker) and `api.bystrek.dev` serves `api` (NestJS + Drizzle + Bun: Postgres, push subscribe/send) — both real services, verified with a real push notification through the deployed stack. Chat, auth, and the data model beyond push subscriptions are still not built; those are deferred, not next-session-immediate. Infra is still managed by hand on the droplet (`~/bystrek/docker-compose.yml`, `Caddyfile`, plus a separate `~/dockge/docker-compose.yml` for Dockge+Watchtower), not deployed from this repo — `infra/` is a synced reference copy only. Deploy is: GitHub Actions builds `api`/`ui` images to GHCR on push; Dockge (loopback + SSH-tunnel only) gives a manual pull-and-redeploy button; Watchtower auto-redeploys those two services (label-scoped) on new image digests.

When the next major architectural shift lands, update this section, the README's status/architecture sections, and `docs/whats-next.md` together.
