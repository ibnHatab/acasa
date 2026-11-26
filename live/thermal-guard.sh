#!/usr/bin/env bash
# thermal-guard.sh: a Nina Pi's last line against heat (the user, 2026-11-26: "if it's high, stop Nina
# and Home Assistant"). Run each minute by nina-thermal.timer: at LIMIT °C or more (the Pi 4 throttles
# at 80) it stops Nina's service and Home Assistant's container, and says so in the journal and in
# ~/.local/state/nina/thermal.log; they stay stopped until the person starts them again.
set -u
LIMIT=${THERMAL_LIMIT:-75}
t=$(( $(cat /sys/class/thermal/thermal_zone0/temp) / 1000 ))
[ "$t" -lt "$LIMIT" ] && exit 0
mkdir -p ~/.local/state/nina
msg="$(date '+%F %T') ${t} °C (limit ${LIMIT}): stopping Nina and Home Assistant"
echo "$msg" | tee -a ~/.local/state/nina/thermal.log
systemctl --user stop nina.service nina-ha-mcp.service 2>/dev/null
docker stop homeassistant >/dev/null 2>&1 || sudo -n docker stop homeassistant >/dev/null 2>&1
echo "stopped: start again with  systemctl --user start nina nina-ha-mcp; docker start homeassistant"
