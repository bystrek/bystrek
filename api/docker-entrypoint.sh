#!/bin/sh
set -e

bun scripts/baseline-migrations.ts
bun run db:migrate
exec "$@"
