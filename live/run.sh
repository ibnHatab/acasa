#!/bin/sh
# Nina (nina-live's cmd/nina: one process, the voice, the rules, the world from her event log) on a
# desktop, as a systemd user service that starts with the session.
#   live/run.sh install    build nina-live, link and enable the units, start them
#   live/run.sh [start] | stop | restart | status | log | uninstall
# The unit's config is live/nina.yaml (its dialogue live/pascal.yaml).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
UNITS="acasa-nina.service"
sc() { systemctl --user "$@"; }
case "${1:-start}" in
install)
	REPO_ROOT="$HOME/repo" bash "$HOME/repo/nina-live/scripts/persona-build.sh"   # the persona's own build
	REPO_ROOT="$HOME/repo" bash "$HERE/build.sh"                                   # bin/nina: the persona with Home Assistant
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
	journalctl --user -f -u acasa-nina ;;
*) echo "usage: $0 [install|start|stop|restart|status|log|uninstall]" >&2; exit 2 ;;
esac
