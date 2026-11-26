#!/usr/bin/env bash
# screen-wake.sh: her activity is the screen's too (acasa, 2026-11-26: she said "I've opened your photos"
# to a screen under the idle overlay). Follows her panel's events; when she wakes, takes a turn,
# speaks or opens the stage, the idle overlay is lifted (as a touch does: idle-wake.sh) and the idle
# daemon restarted, so its timers count from her activity (a synthetic key press does not count as
# activity for labwc's idle notification; lifting the lock alone leaves swayidle's timer stale).
# At most every 20 s. Run by nina-screen-wake.service (the kiosk's user, its Wayland session).
PANEL=${PANEL:-http://127.0.0.1:8770}
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-wayland-0}
nudge() {
  local now
  now=$(date +%s)
  [ $((now - last)) -lt 20 ] && return
  last=$now
  pgrep -x swaylock >/dev/null && /usr/local/lib/ha-pi-kiosk/idle-wake.sh
  pkill -x swayidle
  setsid /usr/local/bin/display-idle.sh >/dev/null 2>&1 </dev/null &
}
last=0
while true; do
  curl -sN "$PANEL/api/events" | while IFS= read -r line; do
    case "$line" in
    data:*'"ev":"attention"'*) [[ $line == *'"awake":true'* ]] && nudge ;;
    data:*'"ev":"turn"'* | data:*'"ev":"first_audio"'* | data:*'"ev":"wake"'*) nudge ;;
    data:*'"ev":"tool"'*) [[ $line == *'"name":"screen"'* ]] && nudge ;;
    esac
  done
  sleep 5
done
