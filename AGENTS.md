# bystrek repo guidance

This repository contains the application code for bystrek:

- `api/` — NestJS + Bun + Drizzle backend
- `ui/` — Angular frontend
- `infra/` — historical Compose/Caddy/deploy mirror for the current homeserver
- `.github/workflows/` — CI and GHCR publish/deploy automation

## Working rules

- Treat `api/.env.example`, `ui/public/config.json`, `ui/config.prod.json`, and
  `infra/README.md` as the documented current behavior.
- Keep the current Compose deployment facts separate from the Kubernetes target
  that lives in `~/Projects/homelab`.
- The API currently runs migrations at container boot via `api/docker-entrypoint.sh`.
  Preserve the restore → original secrets → migrate → API → UI invariant in any
  future deployment docs or manifests.
- Never commit `.env` files, secrets, credential dumps, or generated deployment
  artifacts.
- If you change a public contract used by `homelab` manifests or runbooks,
  update the corresponding docs there too.

## Validation

- Use the existing package scripts only:
  - `bun run format:check`
  - `bun run test`
  - `bun run test:integration`
  - `bun run build`
- Keep deployment/infra checks read-only. Do not run compose, kubectl, or Cloudflare
  changes from this repository as part of bundle work.

## Current facts to preserve

- API port: `3000`
- Database: PostgreSQL 16
- API image pipeline: GHCR build; deployed by pinning its digest in `homelab`
- UI image pipeline: GHCR build; deployed by pinning its digest in `homelab`
- Ollama connectivity is through `LLM_BASE_URL` / `LLM_MODEL`
