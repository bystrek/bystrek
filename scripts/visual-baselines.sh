#!/usr/bin/env bash
# Regenerates ui/e2e/visual/*-snapshots in the same Playwright container CI uses, so the Linux
# baselines match CI's pixels. Run from anywhere: scripts/visual-baselines.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
playwright="$(node -p "require('$root/ui/package.json').devDependencies['@playwright/test']")"

bun_version="$(node -p "require('$root/package.json').packageManager")"

docker run --rm -e BUN="$bun_version" -v "$root":/src:ro -v "$root/ui/e2e/visual":/out \
  "mcr.microsoft.com/playwright:v${playwright}-noble" bash -c '
    set -euo pipefail
    mkdir /work; cd /src && tar --exclude=node_modules --exclude=dist --exclude=storybook-static \
      --exclude=.git --exclude=.angular -cf - . | tar -xf - -C /work
    cd /work
    npm install -g "$BUN" >/dev/null
    bun install --frozen-lockfile
    cd ui && bun run test:visual:update
    cp -r e2e/visual/. /out/
  '
