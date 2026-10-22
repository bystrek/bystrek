#!/usr/bin/env bash
# Local dev: Postgres + migrate + seed owner + api + ui. Needs api/.env (see api/.env.example).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "error: $*" >&2; exit 1; }

echo "==> Checking prerequisites"
[ -t 0 ] || fail "a terminal is required for the SSH tunnel and sudo"
stty sane </dev/tty
command -v bun >/dev/null 2>&1 || fail "bun not found — install from https://bun.sh"
command -v docker >/dev/null 2>&1 || fail "docker not found — install Docker Desktop"
command -v ssh >/dev/null 2>&1 || fail "ssh not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"
[ -n "${BYSTREK_SSH_HOST:-}" ] || fail "set BYSTREK_SSH_HOST to your cluster SSH target"
docker info >/dev/null 2>&1 || fail "docker daemon not running — start Docker Desktop"
[ -f api/.env ] || fail "create api/.env from api/.env.example first"

[ -d api/node_modules ] || (cd api && echo "==> Installing api deps" && bun install)
[ -d ui/node_modules ] || (cd ui && echo "==> Installing ui deps" && bun install)

# A shell-exported DATABASE_URL would override api/.env, so drop it.
unset DATABASE_URL
# Skips RESEND_API_KEY; the local owner is seeded with a password, not an email link.
export BYSTREK_LOCAL_DEV=1
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

echo "==> Migrating and seeding local owner"
(cd api && bun run db:migrate && bun run db:seed:local)

pids=()
tunnel_ready_file=""
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  echo "==> Stopping tunnel/api/ui"
  for pid in "${pids[@]}"; do
    kill_tree "$pid"
  done
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  if [ -n "$tunnel_ready_file" ]; then
    rm -f "$tunnel_ready_file"
  fi
  stty sane </dev/tty
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> Waiting for Ollama tunnel (enter SSH/sudo credentials when prompted)"
tunnel_ready_file="$(mktemp)"
ssh -tt -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:11434:127.0.0.1:11435 \
  "$BYSTREK_SSH_HOST" \
  'sudo k3s kubectl -n apps port-forward svc/ollama 11435:11434 --address 127.0.0.1' \
  > >(tee /dev/tty | while IFS= read -r line; do
    if [[ "$line" == *"Forwarding from 127.0.0.1:11435 -> 11434"* ]]; then
      printf 'ready\n' > "$tunnel_ready_file"
    fi
  done) 2>&1 </dev/tty &
pids+=("$!")
tunnel_pid="$!"

for _ in $(seq 1 120); do
  stty opost onlcr isig </dev/tty
  kill -0 "$tunnel_pid" 2>/dev/null || fail "Ollama tunnel exited"
  if [ -s "$tunnel_ready_file" ] && curl -fs --max-time 2 -o /dev/null http://127.0.0.1:11434/api/tags; then
    break
  fi
  sleep 1
done
kill -0 "$tunnel_pid" 2>/dev/null || fail "Ollama tunnel exited"
[ -s "$tunnel_ready_file" ] && curl -fs --max-time 2 -o /dev/null http://127.0.0.1:11434/api/tags \
  || fail "Ollama tunnel didn't become ready in time"

# Bun runs the API: calendar code uses the Temporal API, which Node lacks.
echo "==> Starting api (start:dev)"
(cd api && exec bun run start:dev --exec bun) &
pids+=("$!")

echo "==> Starting ui"
(cd ui && exec bun run start) &
pids+=("$!")

echo "==> api: http://localhost:3000  ui: http://localhost:4200  (Ctrl+C to stop)"
while :; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || true
      fail "tunnel/api/ui process $pid exited"
    fi
  done
  sleep 1
done
