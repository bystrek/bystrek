# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with a local LLM that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev`

## Status

The app runs on the home server. See [Issues](https://github.com/bystrek/bystrek/issues) (grouped by `MVP`/`Post-MVP` milestones) for the current punch list and the [wiki](https://github.com/bystrek/bystrek/wiki) for the devlog.

**Working today:**
- A home server behind a Cloudflare Tunnel.
- `bystrek.dev` and `api.bystrek.dev` route through Cloudflare to Caddy on the home server.
- `ui/` (Angular, zoneless) at `bystrek.dev`: login, profile, and settings.
- `api/` (NestJS + Drizzle + Bun) at `api.bystrek.dev`: `better-auth`-backed login/invite/ban, and calendar event reads over CalDAV (Infomaniak kCalendar). `POST /calendar/ask` answers one read-only question about the calendar through a local Ollama model (`LLM_BASE_URL`, `LLM_MODEL`); it returns a structured event, a `list` of events (with `count` answered as text), an `availability` answer (`busy` plus the overlapping `conflicts`, decided by the server from the listed events), a text answer, or `cant_do` for write requests.
- Auth: email/password via `better-auth`, invite-gated (admin creates the row, no public signup), bearer tokens, admin plugin for invite/list/ban.
- Deploy pipeline: GitHub Actions builds `api`/`ui` images to GHCR. A reviewed `homelab` change pins the new image digests, and Flux rolls them out when the owner cuts a `homelab` release tag.

**Not built yet:**
- The daily digest for the calendar vertical slice.
- Notes/research/medical/nutrition/gym domains.

## Architecture

Cloudflare Tunnel → Caddy → `ui` (Angular: login, profile, settings); `api.bystrek.dev` → Caddy → `api` (NestJS: Postgres, `better-auth`, calendar over CalDAV). Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Cloudflare Tunnel exposes the application.
- **TLS**: Cloudflare terminates TLS at the tunnel edge.
- **Domain**: `bystrek.dev` is a non-identifying domain.

## Repo layout

```
.github/       CI workflows (builds api/ and ui/ images to GHCR)
api/           NestJS + Drizzle + Bun backend — Postgres, auth, calendar
ui/            Angular frontend — login, profile, settings
scripts/       dev.sh — one-command local start (Postgres, migrate, seed, api, ui)
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
docs/          architecture.md (direction) — live punch list is in GitHub Issues
```

## Local development

1. Create `api/.env` from `api/.env.example`. Set `AUTH_SECRET` and `ENCRYPTION_KEY` (see the example for generation). `ENCRYPTION_KEY` protects saved calendar credentials, so keep it stable.
2. Set `SEED_OWNER_NAME`, `SEED_OWNER_EMAIL`, and `SEED_OWNER_PASSWORD` in `api/.env`.
3. Set `BYSTREK_SSH_HOST` to your cluster SSH target. Run `./scripts/dev.sh`. It opens an SSH tunnel to Ollama, starts Postgres, migrates, creates the owner on first run, and starts the API and UI. Log in at `http://localhost:4200` with the seeded email and password. `Ctrl+C` stops the API and UI; Postgres keeps running.

Add your test CalDAV account in Settings after signing in.

Without `dev.sh`: `cd api && bun run db:migrate && bun run db:seed:local`, then `bun run start:dev` in `api/` and `bun run start` in `ui/`. Set `BYSTREK_LOCAL_DEV=1` so the API starts without `RESEND_API_KEY`. Use `bun run start:remote` in `ui/` to proxy to the deployed API.

Deployed environments use `cd api && bun run db:seed`, which emails a password-setup link instead (needs `RESEND_API_KEY`).

Windows: run it under WSL2, not Git Bash — Docker Desktop already requires WSL2 as its backend.

## Secrets

Nothing here. Application and infrastructure secrets live in `~/bystrek/.env` on the home server (chmod 600), never in git.
