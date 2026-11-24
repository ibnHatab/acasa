#!/usr/bin/env bash
# The kiosk's screen on Pascal (2026-11-24): Nina's dashboard in a Chrome app window at the Pi's
# panel size (1024x600), its own profile (log in to Home Assistant there once). Design here, apply
# with `go run ./cmd/ha-ui`, reload the window (F5).
#   ha-ui/preview.sh [view]       home by default
VIEW="${1:-home}"
exec google-chrome --app="http://homeassistant.local:8123/nina-panel/${VIEW}?kiosk" \
  --window-size=1024,600 --user-data-dir="$HOME/.config/nina-kiosk-preview" \
  --no-first-run --no-default-browser-check >/dev/null 2>&1 &
