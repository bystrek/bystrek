#!/usr/bin/env bash
# Local dev: Postgres + migrate + api + ui. Needs api/.env (see api/.env.example),
# including the LLM_* settings for the hosted model.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "error: $*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    -h | --help)
      echo "usage: scripts/dev.sh"
      exit 0
      ;;
    *) fail "unknown option: $arg (see --help)" ;;
  esac
done

echo "==> Checking prerequisites"
command -v bun >/dev/null 2>&1 || fail "bun not found — install from https://bun.sh"
command -v docker >/dev/null 2>&1 || fail "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || fail "docker daemon not running — start Docker Desktop"
[ -f api/.env ] || fail "create api/.env from api/.env.example first"

[ -d api/node_modules ] || (cd api && echo "==> Installing api deps" && bun install)
[ -d node_modules ] || (echo "==> Installing workspace (ekierka, ui) deps" && bun install)

# A shell-exported DATABASE_URL would override api/.env, so drop it.
unset DATABASE_URL
export HOST="${HOST:-127.0.0.1}"
# Angular CLI would otherwise prompt for analytics, which fails in a background job.
export NG_CLI_ANALYTICS=false

echo "==> Starting dev Postgres"
docker compose -f docker-compose.dev.yml up -d postgres

echo "==> Waiting for Postgres"
for _ in $(seq 1 30); do
  docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 && break
  sleep 1
done
docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 \
  || fail "Postgres didn't become ready in time"

echo "==> Migrating"
(cd api && bun run db:migrate)

pids=()
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  echo "==> Stopping api/ui"
  for pid in "${pids[@]}"; do
    kill_tree "$pid"
  done
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Bun runs the API: calendar code uses the Temporal API, which Node lacks.
echo "==> Starting api (start:dev)"
(cd api && exec bun run start:dev) &
pids+=("$!")

echo "==> Starting ui"
(cd ui && exec bun run start) &
pids+=("$!")

echo "==> api: http://localhost:3000  ui: http://localhost:4200  (Ctrl+C to stop)"
while :; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || true
      fail "api/ui process $pid exited"
    fi
  done
  sleep 1
done
