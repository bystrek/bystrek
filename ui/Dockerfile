# Build from the repo root: docker build -f ui/Dockerfile .
FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
COPY ekierka/angular/package.json ekierka/angular/
COPY ekierka/elements/package.json ekierka/elements/
COPY ekierka/lit/package.json ekierka/lit/
COPY ekierka/lit-angular/package.json ekierka/lit-angular/
COPY ui/package.json ui/
RUN bun install --frozen-lockfile

COPY ekierka ekierka
COPY ui ui
RUN cd ui && bun run build

FROM caddy:2-alpine

WORKDIR /srv
COPY --from=builder /app/ui/dist/ui/browser ./
COPY ui/config.prod.json ./config.json
COPY ui/Caddyfile /etc/caddy/Caddyfile

EXPOSE 3000
