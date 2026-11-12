# bystrek

A self-hosted personal data platform: calendar, notes, research, medical records, nutrition, gym — centralized storage with a local LLM that can read and write into it, plus a custom app for browsing, visualization, and summaries. See [`docs/architecture.md`](docs/architecture.md) for the target design and the reasoning behind it.

`https://bystrek.dev`

## Status

The app runs on the home server. See [Issues](https://github.com/bystrek/bystrek/issues) (grouped by `MVP`/`Post-MVP` milestones) for the current punch list and the [wiki](https://github.com/bystrek/bystrek/wiki) for the devlog.

**Working today:**
- A home server behind a Cloudflare Tunnel.
- `bystrek.dev` and `api.bystrek.dev` route through Cloudflare to Caddy on the home server.
- `ui/` (Angular, zoneless) at `bystrek.dev`: login, profile, and settings.
- `api/` (NestJS + Drizzle + Bun) at `api.bystrek.dev`: `better-auth`-backed sign-in through Pocket ID, and calendar event reads over CalDAV (Infomaniak kCalendar, iCloud) from a local Postgres copy that one PROPFIND checks against the server before every read. `GET /calendar/sync` reports the first download, and reads return 409 until it finishes. `POST /calendar/ask` answers one read-only question about the calendar through a hosted model on an OpenAI-compatible API, Scaleway Generative APIs in production (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`); it returns a structured event, a `list` of events (with `count` answered as text), an `availability` answer (`busy` plus the overlapping `conflicts`, decided by the server from the listed events), a text answer, or `cant_do` for write requests. `/places` holds points of interest shared by all users, with a per-user visited mark; addresses are geocoded through a Nominatim-compatible API (`GEOCODER_URL`) and coordinates are always resolved server-side from the chosen OpenStreetMap object. `POST /places/draft` turns one free-text prompt into a draft through the same hosted model and geocodes it: `ready` (one match), `needs_input` (missing name or address, or an address the geocoder doesn't know), `needs_choice` (several matches), `duplicate` (already on the list), `cant_do` for anything but adding a place, or `text` with a fallback message when the model's reply can't be used; the client confirms a draft with `POST /places`. `/diary` is each user's private diary: `POST /diary/notes` stores a typed note exactly as written together with the events confirmed from it (and any new categories) in one transaction; `GET /diary/events?from&to` returns the events overlapping a range, which `PATCH`/`DELETE /diary/events/:id` edit; `GET /diary/categories` lists the user's categories. `POST /health/import` takes pushes from the Health Auto Export iOS app (REST API automation, JSON, "Summarize Data" on) with a personal API token from settings (`Authorization: Bearer bystrek_…`): it stores each payload as received in `health_imports` and upserts sleep, workouts, weight and taken medication doses as `health` diary events, keyed so a re-sent range never duplicates them; other types stay only in the raw payload.
- Auth: sign-in through the self-hosted Pocket ID (OIDC, passkeys) via `better-auth`'s generic OAuth plugin. Pocket ID decides who gets in: an account is created on a user's first sign-in, and members of `OIDC_ADMIN_GROUP` get the admin role. No passwords, invites or sign-up form. The session reaches the UI as a bearer token through a one-time token (`/auth/sign-in` → Pocket ID → `/auth/handoff` → `POST /api/auth/one-time-token/verify`).
- Deploy pipeline: CI tests and builds `api`/`ui` on every PR and merge without pushing. A manual **Release** workflow publishes both images to GHCR under one CalVer version; `homelab` pins that version tag, and Flux rolls it out when the owner cuts a `homelab` release tag. See [Releasing](#releasing).

**Not built yet:**
- The daily digest for the calendar vertical slice.
- Notes/research/medical/nutrition/gym domains.

## Architecture

Cloudflare Tunnel → Caddy → `ui` (Angular: login, profile, settings); `api.bystrek.dev` → Caddy → `api` (NestJS: Postgres, `better-auth`, calendar over CalDAV). Full design in [`docs/architecture.md`](docs/architecture.md).

- **Access**: Cloudflare Tunnel exposes the application.
- **TLS**: Cloudflare terminates TLS at the tunnel edge.
- **Domain**: `bystrek.dev` is a non-identifying domain.

## Releasing

Images reach GHCR only through the **Release** workflow (`.github/workflows/release.yml`), run by hand from the Actions tab:

1. Merge PRs to `main`.
2. Run **Release** in this repo. It tags `main` with the next version, builds and pushes `ghcr.io/bystrek/api` and `ghcr.io/bystrek/ui` with that tag, then creates a GitHub release with generated notes.
3. Run **Release** in `homelab` with `bystrek_version: latest` (or an older version to roll back) to pin it and deploy.

Versions are `YYYY.M.N`: month without a leading zero (valid semver), N from 1 and reset each month (`2026.11.1`, `2026.11.2`, `2026.12.1`). API and UI share the version. Versions are immutable: a run fails if the tag already exists in git or GHCR, or if `main` has no commits since the last release, and runs are queued so two can't claim the same version. A run that fails after tagging leaves a gap in N; rerun the workflow for a new version.

## Repo layout

```
.github/       CI (tests + image builds) and the Release workflow (publishes images to GHCR)
api/           NestJS + Drizzle + Bun backend — Postgres, auth, calendar
ui/            Angular frontend — login, profile, settings
scripts/       dev.sh — one-command local start (Postgres, migrate, api, ui)
brand/         Logo, icon, and favicon assets (SVG sources + rendered exports)
docs/          architecture.md (direction) — live punch list is in GitHub Issues
```

## Local development

1. Create `api/.env` from `api/.env.example`. Set `AUTH_SECRET` and `ENCRYPTION_KEY` (see the example for generation). `ENCRYPTION_KEY` protects saved calendar credentials, so keep it stable.
2. Set `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` in `api/.env` from a Pocket ID OIDC client for local development (e.g. **bystrek-dev**, callback `http://localhost:3000/api/auth/callback/pocket-id`, PKCE on, your user's group allowed).
3. Set `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` in `api/.env`. Use a Scaleway IAM application key with `GenerativeApisModelAccess`; calls cost a fraction of a cent each.
4. Run `./scripts/dev.sh`. It starts Postgres, migrates, and starts the API and UI. Sign in at `http://localhost:4200` with your Pocket ID account; the first sign-in creates your local user. `Ctrl+C` stops the API and UI; Postgres keeps running.

Add your test CalDAV account in Settings after signing in.

Without `dev.sh`: `cd api && bun run db:migrate`, then `bun run start:dev` in `api/` and `bun run start` in `ui/`. Use `bun run start:remote` in `ui/` to proxy to the deployed API; sign-in then goes through the production Pocket ID client and hands the session back to localhost.

Windows: run it under WSL2, not Git Bash — Docker Desktop already requires WSL2 as its backend.

## Secrets

Nothing here. Application and infrastructure secrets live in `~/bystrek/.env` on the home server (chmod 600), never in git.
