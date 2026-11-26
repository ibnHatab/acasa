#!/bin/sh
# Nina on fsttm-live with the home's rules (Metis), on a desktop, as systemd user services that
# start with the session: acasa-metis-home (metis-home.sh: Home Assistant when its token file is
# there, else simulated devices) and acasa-nina-live (the ReSpeaker, the Live API, the panel on :8770).
#   live/run.sh install    build nina-live, link and enable the units, start them
#   live/run.sh [start] | stop | restart | status | log | uninstall
# Paths: FSTTM_LIVE (~/repo/fsttm-live); the units' config is live/pascal.yaml.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
FSTTM_LIVE=${FSTTM_LIVE:-$HOME/repo/fsttm-live}
# nina (nina-live's cmd/nina: one process, the voice, the rules, the world from her event log);
# OLD=1: the two services before it (metis-home and fsttm-live's nina-live)
UNITS="acasa-nina.service"
[ -n "${OLD:-}" ] && UNITS="acasa-metis-home.service acasa-nina-live.service"
sc() { systemctl --user "$@"; }
case "${1:-start}" in
install)
	if [ -n "${OLD:-}" ]; then (cd "$FSTTM_LIVE" && go build -o bin/nina-live ./cmd/nina-live); else REPO_ROOT="$HOME/repo" bash "$HOME/repo/nina-live/scripts/persona-build.sh"; fi   # the persona's own build
	for u in $UNITS; do sc link "$HERE/systemd/$u"; done
	sc daemon-reload
	sc enable --now $UNITS
	sc --no-pager status $UNITS | grep -E '●|Active:' ;;
uninstall)
	sc disable --now $UNITS || true ;;
start | stop | restart)
	sc "$1" $UNITS
	sc --no-pager status $UNITS | grep -E '●|Active:' || true ;;
status)
	sc --no-pager status $UNITS | grep -E '●|Active:|Main PID' || true ;;
log)
	journalctl --user -f -u acasa-nina -u acasa-metis-home -u acasa-nina-live ;;
*) echo "usage: $0 [install|start|stop|restart|status|log|uninstall]" >&2; exit 2 ;;
esac
