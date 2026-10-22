#!/usr/bin/env bash
# Local dev: Postgres + migrate + seed owner + api + ui. Needs api/.env (see api/.env.example).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f api/.env ]; then
  echo "Create api/.env from api/.env.example first" >&2
  exit 1
fi

compose() { docker compose -f docker-compose.dev.yml "$@"; }

compose up -d postgres
until compose exec -T postgres pg_isready -U bystrek >/dev/null 2>&1; do sleep 1; done

# Skips RESEND_API_KEY; the local owner is seeded with a password, not an email link.
export BYSTREK_LOCAL_DEV=1

(cd api && bun run db:migrate && bun run db:seed:local)

(cd api && bun run start:dev) &
api_pid=$!
(cd ui && bun run start) &
ui_pid=$!

trap 'kill "$api_pid" "$ui_pid" 2>/dev/null || true' EXIT INT TERM
wait
