# Media server — personal project

Not part of the bystrek product. Tracked here since the planning happened in this repo's context and touches choices already documented elsewhere (Tailscale, subdomain/identity policy). `bystrek.dev` / `api.bystrek.dev` / the droplet are untouched by any of this.

## Scope (decided)

- Personal Jellyfin/Plex media server, serving two apartments.
- Not hosted on the droplet. Not exposed publicly. No new `bystrek.dev` subdomain.

## Hosting (decided)

- Runs on an already-owned mini PC (Trigkey S7: Ryzen 7 7840HS, 32GB DDR5, 500GB NVMe + one free M.2 slot) — plenty capable, no reason to buy new hardware or pay for cloud storage/compute.

## Remote access (decided)

- Tailscale — not port-forwarding, not a public hostname. No static IP needed; Tailscale nodes stay addressable under the tailnet regardless of ISP-assigned IP changes (also sidesteps possible CGNAT).
- Apartment 2 (Apple TV + stock ISP router, no additional hardware allowed there): a phone running Tailscale + the media app, AirPlaying to the Apple TV. Apple TV has no Tailscale client (unsupported platform) and a router-level subnet-router setup isn't possible without hardware that can't be added there.
- The other apartment-2 resident gets access via Tailscale's node-sharing feature, scoped to just the media server — not full tailnet membership.
- No public subdomain — Tailscale already covers remote access, and any new hostname is permanently logged in public CT logs, adding attack surface for no functional gain.

## Hardware setup (decided)

- Two physical SSDs, not a shared-partition dual-boot: existing 500GB drive keeps Windows 11 (rare use — nostalgia gaming, ~once/year); new SSD in the free M.2 slot runs Linux + the media library.
- New drive: M.2 2280 NVMe (PCIe 3.0 or 4.0), 512GB–1TB depending on price delta at purchase time, reputable brand with DRAM cache (Samsung/WD/Crucial/Kingston) — no need for high-endurance/premium tiers, workload is mostly sequential reads.
- Boot selection via BIOS boot menu; Linux set as default boot priority.

## OS (decided)

- Ubuntu Server LTS, HWE kernel — needed for solid RDNA3 (780M iGPU) driver/VAAPI support for hardware transcoding.
- XFCE on top for an occasional local desktop; display manager disabled by default so it still boots headless, started on demand (`systemctl start lightdm`).

## Noise (open — next hands-on step)

- Box runs loud even at idle under Windows. Confirmed fan spin, not coil whine — fixable, not a hardware defect.
- Suspects: BIOS fan curve too aggressive by default, Windows background churn (Defender/Update/Search) causing periodic spikes, or an idle power-state (C-state) BIOS setting not optimal.
- Plan: check BIOS fan profile and idle power settings first (OS-independent); watch CPU package power at idle in Windows to confirm/rule out background churn; once on Linux, `powertop` to diagnose + `tlp`/`auto-cpufreq` for idle tuning; `ryzenadj` available separately if load noise (not idle) ever needs capping.

## Open questions

- Jellyfin vs Plex not finalized. Jellyfin: open, no telemetry, no official WebOS app (needs Homebrew Channel sideload). Plex: official WebOS + tvOS apps, easier UX, phones home via plex.tv.
- Exact drive capacity (512GB vs 1TB) — pending price check.
- BIOS fan-curve/idle-power investigation — pending physical access to the box.
