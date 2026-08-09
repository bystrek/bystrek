# infra/

A manually-synced snapshot of the files running on the droplet: `docker-compose.yml`, `Caddyfile`, `Dockerfile` (builds Caddy with the Cloudflare DNS plugin via `xcaddy`, for DNS-01 cert issuance — see `devlog/2026-08-04-day-01.md`) from `~/bystrek/`, and `dockge-docker-compose.yml` from the separate `~/dockge/` stack (Dockge + Watchtower, kept outside `~/bystrek/` so redeploying that stack never risks restarting the tool managing it).

`backup/` mirrors `/root/bystrek/backup/` and the two systemd units in `/etc/systemd/system/` on the droplet: `pg-backup.sh` runs `pg_dump` daily (via `pg-backup.timer`), gzips it to `/root/bystrek-backups/` (deliberately outside `~/bystrek/`, so wiping the stack directory can't also wipe the backups), and prunes anything older than 14 days. Logical/local-only — no off-droplet copy and no encryption at rest. Accepted for two reasons: if the droplet itself is compromised, an unencrypted local dump adds no additional exposure beyond what's already lost; and once tier-2 field encryption (see `docs/architecture.md`) is wired in, sensitive columns are already ciphertext at the app level, so the dump never contains plaintext medical data to begin with. Protects against bad migrations/accidental deletes, not droplet loss.

**Not deployed from here.** The droplet is still edited by hand over SSH; these are copies pulled down for reference and history, not a source the droplet pulls from. If that changes, update this note.

No secrets live in these files — `.env` (holding `CF_API_TOKEN`) stays on the droplet only, referenced here by name (`env_file: .env`, `{env.CF_API_TOKEN}`), never by value. Re-sync manually with `scp` when the droplet's config changes; there's no automation keeping this current.
