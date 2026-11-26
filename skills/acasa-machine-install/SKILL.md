---
name: acasa-machine-install
description: Install a new Nina machine from scratch — a Raspberry Pi 4 (card, first boot, install/machine.sh, Tailscale, Home Assistant onboarding and kiosk login, keys, sound, role and service) or a desktop. Use when setting up Nina for a new person, place or role, reflashing a Pi, or when an install step fails. Credentials have their own skills (acasa-credentials).
---

# Installing a Nina machine

The path and what to check at each step (the scripts: `install/sd-firstboot.sh`, `install/machine.sh`,
`install/update.sh`; the configs: `live/`).
Throughout: **the person signs in, types passwords and Wi-Fi secrets, approves logins and
downloads**; the agent runs commands and fills non-secret fields.

## 1. The card (desktop with a card reader)

- Raspberry Pi OS **Lite** 64-bit (trixie), not Desktop (the kiosk is a bare labwc session). Download
  image + `.sha256` (ask the person first), `sha256sum -c`.
- Flash only after checking the target is the card (size, nothing mounted):
  `xzcat IMG.img.xz | sudo dd of=/dev/mmcblkN bs=4M conv=fsync status=progress`.
- `install/sd-firstboot.sh /media/$USER/bootfs HOST`: hostname, user `nina` with this desktop's SSH
  key, SSH on, serial free. The person writes Wi-Fi into `bootfs/network-config` (or uses a cable).
- Check: `ssh nina@HOST.local`, `cloud-init status` → done. (HDMI0, beside power, shows boot text.)

## 2. The machine (on the Pi as `nina`)

```sh
sudo apt-get install -y -qq git && git clone -q https://github.com/ibnHatab/acasa.git ~/repo/acasa && ~/repo/acasa/install/machine.sh
```

Idempotent (re-run after a failure). Installs packages, Go (checksum-verified), the repos, Home
Assistant + SearXNG in Docker, the persona's build (`nina-live/scripts/persona-build.sh`), the kiosk,
lingering user services. ~25 min on a Pi 4. Then `sudo reboot` once.
Check: ends with "is a Nina machine"; `docker ps` shows `homeassistant`, `searxng`;
`http://HOST.local:8123` shows onboarding.

## 3. Tailscale (optional, remote access)

Install from Tailscale's repo, `sudo tailscale up --hostname=HOST` (the person approves the link),
`sudo tailscale set --ssh`, `~/repo/acasa/live/tailscale-serve.sh`.

## 4. Home Assistant: the person's accounts

- Onboarding (owner account) — the person.
- Integrations: Local Calendar + Local To-do named `Nina`; Google Calendar / Tasks / Photos /
  YouTube (skill `acasa-cred-google-oauth`); Model Context Protocol Server; Music Player Daemon at
  127.0.0.1; whatever the place has.
- Nina's token: skill `acasa-cred-ha-token`.
- Kiosk login: a `system-users` user with no password, local only; `configuration.yaml` →
  `homeassistant: auth_providers:` with `trusted_networks` **first** (127.0.0.1, ::1, that user,
  `allow_bypass_login: true`), then `homeassistant`.
- Use `http://HOST.local:8123`, not an IP (integrations keep their setup address). Chrome on Linux
  skips mDNS: add the Pi to the desktop's `/etc/hosts`; reserve its address in the router.
- Then `~/repo/acasa/install/update.sh` applies the look and feel.

## 5–6. Keys and sound

- Keys: `acasa-cred-gemini-key` (required), `acasa-cred-openrouter` (optional), `acasa-cred-youtube-key`.
- Sound: ReSpeaker array (its own echo canceller) or a separate mic/speaker through
  `live/pipewire/echo-cancel.sh MIC SINK` (then `audio.device: pulse:nina_ec_source`,
  `audio.out: pulse:nina_ec_sink`, `ref: -1`). Calibrate with `fsttm-live/scripts/calib/`.

## 7. Role and service

Skill `acasa-role` for the role (configs, dashboards, catalog). Then the service:
`live/systemd/nina-pi.service` pointed at `nina-HOST.yaml`, linked into `~/.config/systemd/user/`,
`systemctl --user enable --now nina`. ha-mcp: `pipx install --python python3.13 "ha-mcp==9.2.0"` +
`live/systemd/nina-ha-mcp.service`.
Check: `systemctl --user is-active nina` stays `active` after 15 s; her screen
`http://HOST.local:8770/nina/shell.html` wakes when someone says "Nina" (or test with wake-cycle:
nina-persona-testing).

## Pitfalls seen

- Debian trixie splits `docker-cli` from `docker.io`; Lite has no `git`; over SSH PATH lacks
  `/usr/sbin`.
- `journalctl --user` may have no files on a Pi: `sudo journalctl _SYSTEMD_USER_UNIT=nina.service`.
- Screenshot the kiosk over SSH with grim (see nina-persona-testing).
