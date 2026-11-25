#!/usr/bin/env bash
# tailscale-serve.sh: Nina from outside, through the tailnet (the user, 2026-11-25). Run on the
# machine Home Assistant's kiosk runs on (the Pi), once it is enrolled (sudo tailscale up).
#
#   https://<host>.<tailnet>.ts.net/        her own screen (her panel's /nina/shell.html: on https it is
#                                           the remote layout: her card alone, a line to write to her)
#   https://<host>.<tailnet>.ts.net:8443/   Home Assistant (her ⌂ button)
#
# NINA is where her panel runs (default: this machine; while she lives on Pascal: NINA=100.111.202.46, its tailnet address: fixed, where the LAN one is DHCP).
# Home Assistant must trust the proxy (configuration.yaml http: use_x_forwarded_for, trusted_proxies
# 127.0.0.1 and ::1), and her panel must allow https://<host>.<tailnet>.ts.net:8443 (plugins.web
# allow_origin) for her cards inside Home Assistant. Tailscale gives https only on 443, 8443, 10000.
#   tailscale-serve.sh          set up (persistent: --bg)
#   tailscale-serve.sh off      take it down
set -euo pipefail
NINA=${NINA:-127.0.0.1}
if [ "${1:-}" = off ]; then sudo tailscale serve reset; exit; fi
sudo tailscale serve --bg --https=443 "http://$NINA:8770"
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8123
tailscale serve status
