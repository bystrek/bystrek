#!/bin/sh
set -eu

STACK_DIR="${STACK_DIR:-"$HOME/bystrek"}"

if [ "$#" -gt 1 ]; then
  echo "usage: $0 [image-tag]" >&2
  exit 2
fi

if [ "$#" -eq 1 ] && [ -n "$1" ]; then
  IMAGE_TAG="$1"
  case "$IMAGE_TAG" in
    *[!A-Za-z0-9._-]* | '') echo "invalid image tag: $IMAGE_TAG" >&2; exit 2 ;;
  esac
  export API_IMAGE="ghcr.io/bystrek/api:$IMAGE_TAG"
  export UI_IMAGE="ghcr.io/bystrek/ui:$IMAGE_TAG"
fi

cd "$STACK_DIR"
docker compose pull
docker compose up -d --remove-orphans
