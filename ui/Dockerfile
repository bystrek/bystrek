FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1

WORKDIR /app
COPY server.ts ./
COPY --from=builder /app/dist/ui/browser ./browser

EXPOSE 3000
CMD ["bun", "server.ts"]
