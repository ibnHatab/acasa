#!/usr/bin/env bash
# The NUC's kiosk: two Chrome windows tiled on workspace 1.con (kiosk/xmonad.hs):
#   left   the Home Assistant dashboard (http://localhost:8123/), the home
#   right  Nina's streams panel (http://127.0.0.1:8767/): the environment, the reasoning and
#          the conversation as they run (FSTTM's StreamPanel)
# The voice (fsttm) and the Home Assistant feed (fsttm-hass) are systemd user services, not
# started here. Each window has its own Chrome profile (one profile = one browser process, so a
# second --app of it would hand off and exit) and is opened again whenever it closes.
#   kiosk.sh           started by xmonad at login
#   kiosk.sh restart   close both windows: they come back
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
HA="http://localhost:8123/"
PANEL="http://127.0.0.1:8767/"
P_HA="$HOME/.config/acasa/chrome"            # log in to Home Assistant once here, "keep me logged in"
P_PANEL="$HOME/.config/acasa/chrome-panel"
if [ "${1:-}" = restart ]; then pkill -f -- "--user-data-dir=$P_HA" ; pkill -f -- "--user-data-dir=$P_PANEL"; exit 0; fi
mkdir -p "$HERE/.run"
exec >> "$HERE/.run/kiosk.log" 2>&1
xset s off -dpms s noblank 2>/dev/null || true
xsetroot -solid '#0b0e13' 2>/dev/null || true
window() {   # url profile: wait for the page's server, open it, again when it closes
  while true; do
    until curl -s -o /dev/null -m 2 "$1"; do sleep 2; done
    google-chrome --app="$1" --no-first-run --no-default-browser-check --noerrdialogs \
      --disable-session-crashed-bubble --password-store=basic --user-data-dir="$2" || true
    sleep 2
  done
}
window "$PANEL" "$P_PANEL" &
sleep 3                      # the dashboard opens second: a new window is xmonad's master (the left, larger side)
window "$HA" "$P_HA" &
wait
