#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="/root/bystrek"

cd "$STACK_DIR"
docker compose pull
docker compose up -d --remove-orphans
