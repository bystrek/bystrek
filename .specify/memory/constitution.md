<!--
Sync Impact Report
Version change: (unfilled template) → 1.0.0
Modified principles: none (initial ratification)
Added sections: Core Principles I–V, Stack and Operational Constraints,
  Development Workflow, Governance
Removed sections: none
Deferred TODOs: none
-->
# bystrek Constitution

## Core Principles

### I. API Is the Only Gateway to Postgres
The backend API MUST be the single path to Postgres. UI, connectors, and workers
MUST go through the API. Every row MUST carry `owner_id` and `visibility`
(`private`/`shared`); there are no per-item ACLs.
Rationale: one place enforces auth, ownership, and encryption.

### II. LLM Never Writes Directly (NON-NEGOTIABLE)
The LLM MUST NOT call write tools. It drafts a typed action; only the user's
confirmation in the UI performs the write. This applies to all domains, medical
records included. All writes MUST be soft-delete or versioned.

### III. Sensitive Data Is Encrypted at the Application Layer
Sensitive columns MUST use app-level field encryption (AES-256-GCM). The backend
decrypts before calling the model. Encryption keys MUST live in the server `.env`
only and MUST NOT be committed.

### IV. Real-Database Testing
API tests MUST be unit tests for pure logic plus integration tests against a real
Postgres, each in a rolled-back transaction; the DB MUST NOT be mocked as the
primary safety net. UI uses Vitest for unit/component tests and Playwright
(WebKit only) for a small set of e2e journeys. Tests MUST NOT call real third-party
services; stub at the boundary. Tests MUST pass before image build/push.

### V. Simplicity and Provider-Agnostic Design
Build abstractions only when a second real case exists (second backend, user, or
provider). The chat tool-calling contract MUST stay provider-agnostic; the LLM is
reached through `LLM_BASE_URL` / `LLM_MODEL`. Scheduled or async work MUST run
through the scheduler → RabbitMQ → worker path, not ad hoc cron scripts.

## Stack and Operational Constraints

- Stack: `api/` NestJS + Drizzle on Bun with PostgreSQL 16; `ui/` Angular
  (zoneless, signals) as one installed PWA.
- CORS MUST use an explicit origin allowlist (`CORS_ORIGINS` plus
  `http://localhost:*`); wildcards are forbidden.
- Auth is better-auth embedded in the API, bearer tokens, email/password, no public
  signup; users are created by an admin.
- Secrets, `.env` files, credential dumps, and generated deployment artifacts MUST
  NOT be committed. Reference secrets by env var name only. Server secrets live in
  `~/bystrek/.env` on the home server (`chmod 600`).
- Deploys pin GHCR image digests in the `homelab` repo via reviewed PR.
- Migrations run at API container boot. The order restore → original secrets →
  migrate → API → UI MUST be preserved in deployment docs and manifests.
- `api/.env.example`, `ui/public/config.json`, `ui/config.prod.json`, and
  `infra/README.md` document current behavior. `infra/` is a reference copy only.
- Hostnames and content MUST NOT tie the project to a personal identity; flag the
  tradeoff before adding new subdomains or service names. Certificate Transparency
  logs make every issued hostname permanently public.

## Development Workflow

- Validate with the existing package scripts listed in `AGENTS.md` only.
- Infra checks MUST be read-only; do not run compose, kubectl, or Cloudflare
  changes from this repo.
- Changing a public contract used by `homelab` manifests or runbooks MUST update
  the corresponding docs there.
- Docs are short and describe the current stack only; history and rejected
  alternatives go in the wiki devlog.
- URLs MUST come from the user or local files; never invent them.
- PR review: resolve each thread after its fix is pushed, and re-check for
  unresolved threads before reporting done.

## Governance

This constitution supersedes other practices. Amendments require a PR that updates
this file, states the reason, and includes a Sync Impact Report. Versioning is
semantic: MAJOR for removed or redefined principles, MINOR for added principles or
materially expanded guidance, PATCH for wording clarifications. Every PR review MUST
verify compliance, and any deviation MUST be justified in the PR. Use `AGENTS.md`
for runtime development guidance.

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
