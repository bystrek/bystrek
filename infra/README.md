# infra/

Reference copies of the files running on the home server (`~/bystrek/`). Manually synced — the home server is the source of truth, this directory mirrors it.

- `docker-compose.yml` — postgres, api, ui, gateway-caddy. Gateway-caddy joins `homelab_gateway` to receive traffic from main-caddy in the gateway stack. `API_IMAGE` and `UI_IMAGE` optionally select immutable image references.
- `Caddyfile` — gateway-caddy routes `bystrek.dev` → ui, `api.bystrek.dev` → api. No TLS (terminated at Cloudflare edge via tunnel).
- `deploy.sh` — `docker compose pull && up -d --remove-orphans`. Called by the webhook container in the gateway stack when CI curls `deploy.bystrek.dev`; accepts one immutable image tag for a manual staging deployment.

`backup/` mirrors the systemd units for daily `pg_dump` to `~/bystrek-backups/`.

No secrets live in these files — `.env` stays on the home server only, referenced by name (`env_file: .env`), never by value.

## Staging deploy hook

The gateway's `hooks.json` keeps the regular `deploy-bystrek` hook unchanged.
Add a second `deploy-bystrek-staging` hook that calls the same deploy script
and passes the URL's `image_tag` query parameter as its first argument:

```json
{
  "id": "deploy-bystrek-staging",
  "execute-command": "/hooks/deploy-bystrek.sh",
  "pass-arguments-to-command": [
    { "source": "url", "name": "image_tag" }
  ]
}
```

The manually dispatched `build staging images` workflow builds a selected ref,
then calls this hook after the existing deployment-environment approval.
