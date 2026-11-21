#!/usr/bin/env bash
# acasa's kiosk: the service, then Chrome on its page, full screen, again whenever it closes.
#   kiosk.sh           started by xmonad (kiosk/xmonad.hs) at login
#   kiosk.sh restart   close Chrome: the loop below opens the page again
# The mic permission prompt is answered for the page (--use-fake-ui-for-media-stream accepts it; the
# real microphone is used). No screen blanking: the dashboard is always on.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://127.0.0.1:8400/world.html"
if [ "${1:-}" = restart ]; then pkill -f -- "--app=$URL" || true; exit 0; fi
mkdir -p "$HERE/.run"
exec >> "$HERE/.run/kiosk.log" 2>&1
xset s off -dpms s noblank 2>/dev/null || true
xsetroot -solid '#0b0e13' 2>/dev/null || true
"$HERE/run.sh" start || true
for _ in $(seq 1 120); do curl -s -o /dev/null -m 2 "$URL" && break; sleep 2; done   # the model takes ~2 minutes to load
while true; do
  google-chrome --app="$URL" --start-fullscreen --no-first-run --no-default-browser-check --noerrdialogs \
    --disable-session-crashed-bubble --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$HOME/.config/acasa/chrome" || true
  sleep 2
done
