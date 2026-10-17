#!/usr/bin/env bash
# Prepares a private local database and runs api + ui.
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

DEV_ENV="${BYSTREK_DEV_ENV:-$HOME/.config/bystrek/dev.env}"
if [ ! -f "$DEV_ENV" ]; then
  [ -t 0 ] || fail "first-time setup needs a terminal for the local owner and password"
  echo "==> Creating private local config at $DEV_ENV"
  mkdir -p -m 700 "$(dirname "$DEV_ENV")"
  umask 077
  vapid_json="$(cd api && ./node_modules/.bin/web-push generate-vapid-keys --json)"
  vapid_public="$(echo "$vapid_json" | grep -oE '"publicKey":"[^"]*"' | cut -d'"' -f4)"
  vapid_private="$(echo "$vapid_json" | grep -oE '"privateKey":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$vapid_public" ] && [ -n "$vapid_private" ] || fail "failed to generate VAPID keypair"

  seed_name="$(git config user.name 2>/dev/null || true)"
  seed_email="$(git config user.email 2>/dev/null || true)"
  echo "==> Local owner (press Enter to accept the default)"
  read -r -p "    Name [$seed_name]: " input_name
  read -r -p "    Email [$seed_email]: " input_email
  seed_name="${input_name:-$seed_name}"
  seed_email="${input_email:-$seed_email}"
  [[ "$seed_email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || fail "a local owner email is required"
  [ -n "$seed_name" ] || fail "a local owner name is required"
  auth_secret="$(bun -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
  encryption_key="$(bun -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
  cat > "$DEV_ENV" <<EOF
PORT=3000
HOST=127.0.0.1
DATABASE_URL=postgres://bystrek:bystrek@localhost:5432/bystrek_dev
CORS_ORIGINS=http://localhost:4200
VAPID_PUBLIC_KEY=$vapid_public
VAPID_PRIVATE_KEY=$vapid_private
VAPID_SUBJECT=mailto:$seed_email
SEED_OWNER_NAME=$seed_name
SEED_OWNER_EMAIL=$seed_email
AUTH_SECRET=$auth_secret
UI_URL=http://localhost:4200
API_URL=http://localhost:3000
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=smollm2:1.7b
LLM_TIMEOUT_MS=120000
ENCRYPTION_KEY=$encryption_key
EOF
fi
chmod 600 "$DEV_ENV"
export DOTENV_CONFIG_PATH="$DEV_ENV"
export BYSTREK_LOCAL_DEV=1
unset DATABASE_URL

echo "==> Starting dev Postgres"
docker compose -f docker-compose.dev.yml up -d

echo "==> Waiting for Postgres"
for _ in $(seq 1 30); do
  docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 && break
  sleep 1
done
docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U bystrek >/dev/null 2>&1 \
  || fail "Postgres didn't become ready in time"

echo "==> Preparing local database"
(cd api && bun --env-file="$DEV_ENV" run src/db/ensure-local-db.ts && bun --env-file="$DEV_ENV" run db:migrate)

seed_status="$(cd api && bun --env-file="$DEV_ENV" run src/db/seed-local.ts --check)"
case "$seed_status" in
  ready) ;;
  needs-password)
    [ -t 0 ] || fail "first-time setup needs a terminal to enter the local password"
    read -r -s -p "    Local login password (8-128 characters): " local_password
    echo
    [ "${#local_password}" -ge 8 ] && [ "${#local_password}" -le 128 ] \
      || fail "local password must be 8-128 characters"
    printf '%s' "$local_password" | (cd api && bun --env-file="$DEV_ENV" run src/db/seed-local.ts --create)
    unset local_password
    ;;
  *) fail "unexpected local owner status: $seed_status" ;;
esac

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
(cd api && exec bun --env-file="$DEV_ENV" run start:dev --exec bun) &
pids+=($!)

echo "==> Starting ui (dev)"
(cd ui && exec env NG_CLI_ANALYTICS=false bun run start) &
pids+=($!)

echo "==> api: http://localhost:3000  ui: http://localhost:4200  (Ctrl+C to stop)"
wait
