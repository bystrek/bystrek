#!/usr/bin/env bash
# Checks prerequisites and runs api + ui locally against a dev Postgres.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "error: $*" >&2; exit 1; }

echo "==> Checking prerequisites"

command -v bun >/dev/null 2>&1 || fail "bun not found — install from https://bun.sh"
command -v docker >/dev/null 2>&1 || fail "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || fail "docker daemon not running — start Docker Desktop"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin not found"

[ -d api/node_modules ] || (cd api && echo "==> Installing api deps" && bun install)
[ -d ui/node_modules ] || (cd ui && echo "==> Installing ui deps" && bun install)

if [ ! -f ui/.env ]; then
  echo "==> Generating ui/.env from defaults"
  cp ui/.env.example ui/.env
fi

if [ ! -f api/.env ]; then
  echo "==> Generating api/.env with a fresh local VAPID keypair"
  vapid_json="$(cd api && ./node_modules/.bin/web-push generate-vapid-keys --json)"
  vapid_public="$(echo "$vapid_json" | grep -oE '"publicKey":"[^"]*"' | cut -d'"' -f4)"
  vapid_private="$(echo "$vapid_json" | grep -oE '"privateKey":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$vapid_public" ] && [ -n "$vapid_private" ] || fail "failed to generate VAPID keypair"

  seed_name="$(git config user.name 2>/dev/null || true)"
  seed_email="$(git config user.email 2>/dev/null || true)"
  if [ -t 0 ]; then
    echo "==> Seed owner (used by 'bun run db:seed' — press Enter to accept the default)"
    read -r -p "    Name [$seed_name]: " input_name
    read -r -p "    Email [$seed_email]: " input_email
    seed_name="${input_name:-$seed_name}"
    seed_email="${input_email:-$seed_email}"
  fi

  awk -v pub="$vapid_public" -v priv="$vapid_private" -v name="$seed_name" -v email="$seed_email" '
    /^VAPID_PUBLIC_KEY=/  { print "VAPID_PUBLIC_KEY=" pub; next }
    /^VAPID_PRIVATE_KEY=/ { print "VAPID_PRIVATE_KEY=" priv; next }
    /^SEED_OWNER_NAME=/   { print "SEED_OWNER_NAME=" name; next }
    /^SEED_OWNER_EMAIL=/  { print "SEED_OWNER_EMAIL=" email; next }
    { print }
  ' api/.env.example > api/.env
fi

echo "==> Starting dev Postgres"
docker compose -f docker-compose.dev.yml up -d

echo "==> Waiting for Postgres"
for _ in $(seq 1 30); do
  docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 && break
  sleep 1
done
docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 \
  || fail "Postgres didn't become ready in time"

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
}
trap cleanup EXIT INT TERM

echo "==> Starting api (start:dev)"
(cd api && exec bun run start:dev) &
pids+=($!)

echo "==> Starting ui (dev)"
(cd ui && exec bun run dev) &
pids+=($!)

echo "==> api: http://localhost:3000  ui: http://localhost:5173  (Ctrl+C to stop)"
wait
