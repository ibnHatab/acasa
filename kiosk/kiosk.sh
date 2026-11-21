#!/usr/bin/env bash
# At login: one ordinary Chrome window with two tabs, the Home Assistant dashboard and Nina's
# streams panel (FSTTM's StreamPanel: environment, reasoning, conversation). No kiosk: not full
# screen, not reopened when closed. The voice (fsttm) and the Home Assistant feed (fsttm-hass)
# are systemd user services, not started here.
#   kiosk.sh           started by xmonad at login (once)
#   kiosk.sh open      open the two tabs again (in the running Chrome if there is one)
set -u
HA="http://localhost:8123/"
PANEL="http://127.0.0.1:8767/"
PROFILE="$HOME/.config/acasa/chrome"     # logged in to Home Assistant
xset s off -dpms s noblank 2>/dev/null || true
for _ in $(seq 1 60); do curl -s -o /dev/null -m 2 "$HA" && break; sleep 2; done
exec google-chrome --no-first-run --no-default-browser-check --password-store=basic \
  --user-data-dir="$PROFILE" "$HA" "$PANEL"
