FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM caddy:2-alpine

WORKDIR /srv
COPY --from=builder /app/dist/ui/browser ./
COPY config.prod.json ./config.json
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 3000
