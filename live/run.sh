#!/bin/sh
# Nina on fsttm-live with the home's rules (Metis), on a desktop: metis-home (simulated devices
# unless METIS_HOME_HA is set) and nina-live (the ReSpeaker, the Live API, the panel on :8770).
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
