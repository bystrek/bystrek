# Technical Trace — bystrek.dev

Raw facts as of 2026-08-04. No secret values included — only where they're stored.

## Domain
- **Domain**: `bystrek.dev`
- **Registrar / DNS**: Cloudflare
- **DNS record**: `A` record, name `@` (apex) → `100.112.190.126` (droplet's Tailscale IP)
- **Proxy status**: DNS only (grey cloud) — intentionally NOT proxied through Cloudflare's edge, since it points at a private address
- **TLS**: Let's Encrypt certificate via Caddy, issued through a DNS-01 challenge using a Cloudflare API token scoped to `Zone:DNS:Edit` for the `bystrek.dev` zone only. Token stored in `~/bystrek/.env` on the droplet (`CF_API_TOKEN`), not committed anywhere.

## VPS
- **Provider**: DigitalOcean
- **Plan**: Basic Droplet, $12/mo tier
- **Image**: Marketplace "Docker on Ubuntu" (Docker + Docker Compose preinstalled)
- **Hostname**: `bystrek`
- **Region**: Frankfurt or Amsterdam (not explicitly confirmed in session — check DO dashboard)
- **Public IPv4**: `167.99.245.221` (SSH access only; blocked for everything else by the Cloud Firewall)
- **Private IP** (DigitalOcean VPC): `10.114.0.2`
- **Tailscale IP**: `100.112.190.126`
- **Tailnet name**: `tail85a641.ts.net`
- **SSH**: key-based only, ed25519 key pair generated on the user's Mac at `~/.ssh/id_ed25519` (comment: `bobrowicz.michal@gmail.com`)

## DigitalOcean Cloud Firewall
- **Inbound**: TCP 22 (SSH) only, from all IPv4/IPv6
- **Outbound**: confirmed "All UDP, all ports, all IPv4/IPv6" is present (verified during DNS troubleshooting); TCP/ICMP outbound rules assumed present from DO's default template but not individually re-confirmed in this session
- No inbound rules for 80/443 — the droplet is not reachable on HTTP/HTTPS from the public internet at all; only reachable via the Tailscale interface

## Tailscale
- Installed via official install script on both the droplet and the user's Mac, joined to the same tailnet (personal account, login via Google/GitHub — same account used across devices)
- Droplet's Tailscale IP is stable at `100.112.190.126` as of this session

## Docker stack (on droplet, `~/bystrek/`)
Files:
- `docker-compose.yml`
- `Dockerfile` — builds Caddy with the Cloudflare DNS plugin via `xcaddy` (`github.com/caddy-dns/cloudflare`), since the stock Caddy image doesn't include DNS provider plugins
- `Caddyfile`:
  ```
  bystrek.dev {
      tls {
          dns cloudflare {env.CF_API_TOKEN}
      }
      reverse_proxy web:80
  }
  ```
- `.env` — contains `CF_API_TOKEN` (chmod 600)
- `index.html` — placeholder test page content

Services (`docker-compose.yml`):
- **`web`**: `nginx` image, serves `./index.html`, no published host port (internal Docker network only)
- **`caddy`**: built from local `Dockerfile`, publishes `80:80` and `443:443`, reads `.env`, explicit `dns: [1.1.1.1, 8.8.8.8]` override (required — see below), volumes `caddy_data:/data` and `caddy_config:/config` for cert persistence, mounts `./Caddyfile:/etc/caddy/Caddyfile`

## Known issue and workaround
DNS-01 challenge zone lookups from inside the `caddy` container returned `SERVFAIL` when using the container's default resolver chain (Docker embedded DNS at `127.0.0.11` → host's `systemd-resolved` at `127.0.0.53` → chain affected by Tailscale's DNS proxy, evidenced by `search tail85a641.ts.net` in resolv.conf). Confirmed Cloudflare's DNS and the DO firewall were NOT the cause (direct DoH query to Cloudflare returned the correct NXDOMAIN+SOA-authority response; outbound UDP confirmed open). Fixed by pinning the `caddy` service to public resolvers directly via the `dns:` key in `docker-compose.yml`. This override should be kept in place going forward — removing it will likely reintroduce the issue on cert renewal.

## What's currently running
As of end of session: `web` (placeholder nginx) + `caddy` (reverse proxy + TLS), reachable at `https://bystrek.dev` only from devices on the Tailscale tailnet. No Open WebUI, no Claude connection, no calendar/notes integration yet — see `whats-next.md`.
