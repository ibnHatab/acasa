#!/usr/bin/env bash
# acasa's kiosk: the service, and Chrome full screen: on the loading page while the model loads (about two
# minutes), on the dashboard once the service answers. Chrome again whenever it closes.
#   kiosk.sh           started by xmonad (kiosk/xmonad.hs) at login
#   kiosk.sh restart   close Chrome: the loop below opens it again
# The microphone is allowed for the page by Chrome's policy (kiosk/setup.sh writes it), not by a flag.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="$HOME/.config/acasa/chrome"
URL="http://127.0.0.1:8400/world.html"
up() { curl -s -o /dev/null -m 2 "$URL"; }
if [ "${1:-}" = restart ]; then pkill -f -- "--user-data-dir=$PROFILE" || true; exit 0; fi
mkdir -p "$HERE/.run"
exec >> "$HERE/.run/kiosk.log" 2>&1
xset s off -dpms s noblank 2>/dev/null || true
xsetroot -solid '#0b0e13' 2>/dev/null || true
"$HERE/run.sh" start || true
while true; do
  if up; then page="$URL"; else
    page="file://$HERE/kiosk/loading.html"
    ( until up; do sleep 2; done; pkill -f -- "--user-data-dir=$PROFILE" ) &    # the service is up: this Chrome goes, the next is the dashboard
  fi
  google-chrome --app="$page" --start-fullscreen --no-first-run --no-default-browser-check --noerrdialogs \
    --disable-session-crashed-bubble --password-store=basic --autoplay-policy=no-user-gesture-required --user-data-dir="$PROFILE" || true
  sleep 1
done
