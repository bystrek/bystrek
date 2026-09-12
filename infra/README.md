# infra/

Reference copies of the files running on the home server (`~/bystrek/`). Manually synced — the home server is the source of truth, this directory mirrors it.

- `docker-compose.yml` — postgres, api, ui, gateway-caddy. Gateway-caddy joins `homelab_gateway` to receive traffic from main-caddy in the gateway stack.
- `Caddyfile` — gateway-caddy routes `bystrek.dev` → ui, `api.bystrek.dev` → api. No TLS (terminated at Cloudflare edge via tunnel).
- `deploy.sh` — `docker compose pull && up -d --remove-orphans`. Called by the webhook container in the gateway stack when CI curls `deploy.bystrek.dev`.

`backup/` mirrors the systemd units for daily `pg_dump` to `~/bystrek-backups/`.

No secrets live in these files — `.env` stays on the home server only, referenced by name (`env_file: .env`), never by value.
