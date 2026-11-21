#!/usr/bin/env bash
# acasa — the home under metis-agent's service: the home domain (domains/home) on Gemma 4 E2B, the page (web/) with
# the dialog (fsttm-web: Chrome's speech recognition and synthesis) and the device tiles.
#   ./run.sh [start]   start in the background, print the URL
#   ./run.sh stop | status | log | fg     (fg: in the foreground)
# METIS_AGENT (default ~/metis/metis-agent, else the sibling checkout), ADDR (default 0.0.0.0:8400: every interface, the LAN and the tailnet),
# ACASA_THREADS (default: the physical cores), ACASA_NCTX (default 8192).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT="${METIS_AGENT:-$HOME/metis/metis-agent}"
[ -d "$AGENT/py" ] || AGENT="$(cd "$HERE/.." && pwd)/metis-agent"
PY="$AGENT/py/.venv/bin/python"
MODEL="${ACASA_MODEL:-$AGENT/go/models/gemma4/gemma-4-E2B-it-Q4_K_M.gguf}"
ADDR="${ADDR:-0.0.0.0:8400}"
RUN="$HERE/.run"; PID="$RUN/service.pid"; LOG="$RUN/service.log"
NCTX="${ACASA_NCTX:-8192}"
running() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }
config() {
  mkdir -p "$RUN"
  cat > "$RUN/config.yaml" <<Y
# written by run.sh at every start: edit run.sh, not this
model: $MODEL
template: gemma4
stop_words: [stop, halt, freeze, quiet]
v3:
    prompt: [$AGENT/go/grammar/v3-orchestrator.txt]
    catalog: [home]
    loaded: [home]
    n_ctx: $NCTX
    tick_ms: 1500
    journal: $RUN/session.jsonl
    world_map: $HERE/web/home.json
domains:
    names: [home]
    narrate: home
    case: live
    seed: 1
    clocks: [{domain: home, n: 1}]
    trace: true
    records: catalog
    narrator_n_ctx: 4096
    seat_n_ctx: 4096
ws:
    addr: $ADDR
Y
}
start() {
  [ -x "$PY" ] || { echo "no metis-agent venv at $PY (set METIS_AGENT)" >&2; exit 2; }
  [ -f "$MODEL" ] || { echo "no model at $MODEL (set ACASA_MODEL)" >&2; exit 2; }
  config
  export METIS_CATALOG="$HERE" METISC="${METISC:-$(cd "$AGENT/.." && pwd)/metis-lang/src/metisc}"
  cd "$AGENT/py"
  set -- "$PY" "$HERE/serve.py" --config "$RUN/config.yaml" --ui-dir "$HERE/web" --lib-dir "$HERE/web/vendor" --addr "$ADDR" --no-wait-viewer
  if [ "$MODE" = fg ]; then exec "$@"; fi
  nohup "$@" >> "$LOG" 2>&1 &
  echo $! > "$PID"
  echo "acasa: http://$ADDR/world.html   (log: ./run.sh log)"
}
MODE="${1:-start}"
case "$MODE" in
  start) running && { echo "already running (pid $(cat "$PID")): http://$ADDR/world.html"; exit 0; }; start ;;
  restart) running && kill "$(cat "$PID")"; rm -f "$PID"; sleep 2; start ;;
  fg) start ;;
  stop) running && kill "$(cat "$PID")" && echo stopped || echo "not running"; rm -f "$PID" ;;
  status) running && echo "running (pid $(cat "$PID")): http://$ADDR/world.html" || echo "not running" ;;
  log) exec tail -f "$LOG" ;;
  *) echo "usage: run.sh [start|restart|stop|status|log|fg]" >&2; exit 2 ;;
esac
