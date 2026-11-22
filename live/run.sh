#!/bin/sh
# Nina on fsttm-live with the home's rules (Metis), on a desktop: metis-home (Home Assistant
# when its token file is there, else simulated devices) and nina-live (the ReSpeaker, the Live API, the panel on :8770).
#   live/run.sh [start] | stop | status | log
# Paths: FSTTM_LIVE (~/repo/fsttm-live), METIS (~/repo/perotheia-packages), CONFIG (live/pascal.yaml).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
FSTTM_LIVE=${FSTTM_LIVE:-$HOME/repo/fsttm-live}
METIS=${METIS:-$HOME/repo/perotheia-packages}
CONFIG=${CONFIG:-$HERE/pascal.yaml}
RUN=${XDG_RUNTIME_DIR:-/tmp}/acasa-live
mkdir -p "$RUN"
pidof_() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null && cat "$RUN/$1.pid"; }
case "${1:-start}" in
start)
	# Home Assistant when its token is there (HA_TOKEN): the rules then read and switch the real
	# devices through it, and its state reaches Nina as ENVIRONMENT; else the devices are simulated
	HA_URL=${HA_URL:-http://127.0.0.1:8123}
	HA_TOKEN=${HA_TOKEN:-$HOME/.config/fsttm/hass.token}
	if [ -s "$HA_TOKEN" ] && curl -s -o /dev/null -m 3 "$HA_URL/"; then
		export METIS_HOME_HA=$HA_URL METIS_HOME_TOKEN=$HA_TOKEN
		echo "Home Assistant: $HA_URL"
	else
		unset METIS_HOME_HA
		echo "Home Assistant: no token at $HA_TOKEN (or not up): simulated devices"
	fi
	if ! pidof_ metis-home >/dev/null; then
		METISC=$METIS/metis-lang/src/metisc nohup "$METIS/metis-agent-home/go/bin/metis-home" \
			-world "$METIS/metis-worlds-home/home" >"$RUN/metis-home.log" 2>&1 &
		echo $! >"$RUN/metis-home.pid"
	fi
	[ -x "$FSTTM_LIVE/bin/nina-live" ] || (cd "$FSTTM_LIVE" && go build -o bin/nina-live ./cmd/nina-live)
	if ! pidof_ nina-live >/dev/null; then
		nohup "$FSTTM_LIVE/bin/nina-live" -config "$CONFIG" -q -stdin=false -log "$RUN/nina-live.jsonl" \
			>"$RUN/nina-live.out" 2>&1 &
		echo $! >"$RUN/nina-live.pid"
	fi
	echo "metis-home $(pidof_ metis-home), nina-live $(pidof_ nina-live): http://localhost:8770/" ;;
stop)
	for p in nina-live metis-home; do pid=$(pidof_ $p) && kill "$pid" && echo "stopped $p"; done; true ;;
status)
	for p in metis-home nina-live; do printf '%s: %s\n' $p "$(pidof_ $p || echo down)"; done ;;
log)
	tail -f "$RUN/nina-live.jsonl" "$RUN/metis-home.log" ;;
*) echo "usage: $0 [start|stop|status|log]" >&2; exit 2 ;;
esac
