#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="/root/bystrek"
BACKUP_DIR="/root/bystrek-backups"
RETENTION_DAYS=14

set -a
source "$STACK_DIR/.env"
set +a

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/postgres-${TIMESTAMP}.sql.gz"

docker compose -f "$STACK_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

find "$BACKUP_DIR" -name 'postgres-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "Backed up to $OUT"
