# infra/

Reference copies of the files running on the home server (`~/bystrek/`). Manually synced — the home server is the source of truth, this directory mirrors it.

- `docker-compose.yml` — postgres, api, ui, gateway-caddy. Gateway-caddy joins `homelab_gateway` as `bystrek-gateway` so main-caddy can route to it; API joins private `homelab_llm` to call Ollama. `API_IMAGE` and `UI_IMAGE` optionally select immutable image references.
- `Caddyfile` — gateway-caddy routes `bystrek.dev` → ui, `api.bystrek.dev` → api. No TLS (terminated at Cloudflare edge via tunnel).
- `deploy.sh` — `docker compose pull && up -d --remove-orphans`. Called by the webhook container in the gateway stack when CI curls `deploy.bystrek.dev`; accepts one immutable image tag for a selected-ref deployment.
`backup/` mirrors the systemd units for daily `pg_dump` to `~/bystrek-backups/`.

No secrets live in these files — `.env` stays on the home server only, referenced by name (`env_file: .env`), never by value.

## Selected-ref deployment

Add this field to the gateway's existing `deploy-bystrek` hook to pass the
URL's optional `image_tag` query parameter as the deploy script's first
argument:

```json
"pass-arguments-to-command": [
  { "source": "url", "name": "image_tag" }
]
```

An omitted or empty `image_tag` retains the regular `latest` deployment. The
manually dispatched `deploy selected ref` workflow builds a selected ref, then
calls this hook with an immutable image tag after the existing GitHub
Environment approval.

## Local LLM

Create `homelab_llm` as an external Docker network. Attach the Ollama service
and the Bystrek `api` service to it; no gateway service joins this network.

Set these values in `~/bystrek/.env`:

```sh
LLM_BASE_URL=http://ollama:11434
LLM_MODEL=smollm2:1.7b
```
