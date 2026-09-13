# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with a local LLM that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev`

## Status

The app runs on the home server. See [Issues](https://github.com/bystrek/bystrek/issues) (grouped by `MVP`/`Post-MVP` milestones) for the current punch list and the [wiki](https://github.com/bystrek/bystrek/wiki) for the devlog.

**Working today:**
- A home server behind a Cloudflare Tunnel.
- `bystrek.dev` and `api.bystrek.dev` route through Cloudflare to Caddy on the home server.
- `ui/` (Angular, zoneless) at `bystrek.dev`: subscribe UI + service worker, login/user admin, profile, and chat pages.
- `api/` (NestJS + Drizzle + Bun) at `api.bystrek.dev`: Postgres-backed subscriptions table, push subscribe/send endpoints, `better-auth`-backed login/invite/ban, `POST /chat` streaming local Ollama replies over SSE, and a calendar tool (CalDAV against Infomaniak kCalendar) with mutating actions gated behind explicit user confirmation. Verified end to end — a real push landed on a device via the deployed stack, and calendar read/write was verified against a real Infomaniak account.
- Auth: email/password via `better-auth`, invite-gated (admin creates the row, no public signup), bearer tokens, admin plugin for invite/list/ban. Passkey deferred past v1.
- Deploy pipeline: GitHub Actions builds `api`/`ui` images to GHCR, then calls a Cloudflare Access-protected deployment webhook with a service token. The deployment remains gated by a GitHub Environment requiring review.

**Not built yet:**
- `owner_id`/`visibility` on domain tables — deferred until more domains exist (tier-2 field encryption is live, used by chat and calendar credentials).
- An agenda view and the daily digest push for the calendar vertical slice.
- Notes/research/medical/nutrition/gym domains.
- Proactive nudging (the assistant messaging first, not just replying).

## Architecture

Cloudflare Tunnel → Caddy → `ui` (Angular: subscribe UI + service worker, login/user admin, profile, chat); `api.bystrek.dev` → Caddy → `api` (NestJS: Postgres, push send/subscribe, `better-auth`, chat via private Ollama). Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Cloudflare Tunnel exposes the application; the deployment webhook is protected by Cloudflare Access service-token authentication.
- **TLS**: Cloudflare terminates TLS at the tunnel edge.
- **Domain**: `bystrek.dev` is a non-identifying domain.

For current infrastructure configuration, see `infra/` below.

## Repo layout

```
.github/       CI workflows (builds api/ and ui/ images to GHCR)
api/           NestJS + Drizzle + Bun backend — Postgres, push subscribe/send, chat
ui/            Angular frontend — subscribe UI, service worker, chat
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
docs/          architecture.md (direction) — live punch list is in GitHub Issues
infra/         Manually-synced copies of the home-server configuration
```

## Local development

`./scripts/dev.sh` checks prerequisites (`bun`, `docker`), generates `api/.env`/`ui/.env` on first run (prompts for a seed owner name/email, defaulting to your `git config`), starts a dev Postgres, and runs `api`/`ui` together. `Ctrl+C` stops `api`/`ui`; Postgres keeps running.

Windows: run it under WSL2, not Git Bash — Docker Desktop already requires WSL2 as its backend.

## Infra snapshot

[`infra/`](infra/) holds reference copies of the home server's `docker-compose.yml`, `Caddyfile`, and `deploy.sh`. See [`infra/README.md`](infra/README.md) for the sync model.

## Secrets

Nothing here. Application and infrastructure secrets live in `~/bystrek/.env` on the home server (chmod 600), never in git.
