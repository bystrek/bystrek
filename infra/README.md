# infra/

A manually-synced snapshot of the files running on the droplet: `docker-compose.yml`, `Caddyfile`, `Dockerfile` (builds Caddy with the Cloudflare DNS plugin via `xcaddy`, for DNS-01 cert issuance — see `devlog/2026-08-04-day-01.md`) from `~/bystrek/`, and `dockge-docker-compose.yml` from the separate `~/dockge/` stack (Dockge + Watchtower, kept outside `~/bystrek/` so redeploying that stack never risks restarting the tool managing it).

**Not deployed from here.** The droplet is still edited by hand over SSH; these are copies pulled down for reference and history, not a source the droplet pulls from. If that changes, update this note.

No secrets live in these files — `.env` (holding `CF_API_TOKEN`) stays on the droplet only, referenced here by name (`env_file: .env`, `{env.CF_API_TOKEN}`), never by value. Re-sync manually with `scp` when the droplet's config changes; there's no automation keeping this current.
