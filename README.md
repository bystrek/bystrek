# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with a local LLM that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev`

## Status

The app runs on the home server. See [Issues](https://github.com/bystrek/bystrek/issues) (grouped by `MVP`/`Post-MVP` milestones) for the current punch list and the [wiki](https://github.com/bystrek/bystrek/wiki) for the devlog.

**Working today:**
- A home server behind a Cloudflare Tunnel.
- `bystrek.dev` and `api.bystrek.dev` route through Cloudflare to Caddy on the home server.
- `ui/` (Angular, zoneless) at `bystrek.dev`: login, profile, settings, and the agenda page.
- `api/` (NestJS + Drizzle + Bun) at `api.bystrek.dev`: `better-auth`-backed login/invite/ban, and calendar read/write over CalDAV (Infomaniak kCalendar) with mutating actions gated behind explicit user confirmation.
- Auth: email/password via `better-auth`, invite-gated (admin creates the row, no public signup), bearer tokens, admin plugin for invite/list/ban.
- Deploy pipeline: GitHub Actions builds `api`/`ui` images to GHCR. A reviewed `homelab` change pins the new image digests, and Flux rolls them out when the owner cuts a `homelab` release tag.

**Not built yet:**
- An agenda view and the daily digest for the calendar vertical slice.
- Notes/research/medical/nutrition/gym domains.

## Architecture

Cloudflare Tunnel → Caddy → `ui` (Angular: login, profile, settings, agenda); `api.bystrek.dev` → Caddy → `api` (NestJS: Postgres, `better-auth`, calendar over CalDAV). Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Cloudflare Tunnel exposes the application.
- **TLS**: Cloudflare terminates TLS at the tunnel edge.
- **Domain**: `bystrek.dev` is a non-identifying domain.

## Repo layout

```
.github/       CI workflows (builds api/ and ui/ images to GHCR)
api/           NestJS + Drizzle + Bun backend — Postgres, auth, calendar
ui/            Angular frontend — login, profile, settings, agenda
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
docs/          architecture.md (direction) — live punch list is in GitHub Issues
```

## Local development

1. Start Postgres: `docker compose -f docker-compose.dev.yml up -d`
2. Create `api/.env` from `api/.env.example`. Set `DATABASE_URL=postgres://bystrek:bystrek@localhost:5432/bystrek`. Set `AUTH_SECRET` and `ENCRYPTION_KEY` (see the example for generation). `ENCRYPTION_KEY` protects saved calendar credentials, so keep it stable.
3. Migrate and start the API: `cd api && bun run db:migrate && bun run start:dev`
4. Start the UI: `cd ui && bun run start`. Use `bun run start:remote` to proxy to the deployed API.

Add your test CalDAV account in Settings after signing in.

Windows: run it under WSL2, not Git Bash — Docker Desktop already requires WSL2 as its backend.

## Secrets

Nothing here. Application and infrastructure secrets live in `~/bystrek/.env` on the home server (chmod 600), never in git.
