#!/usr/bin/env bash
# build.sh: Nina at home, bin/nina (acasa's cmd/nina: the persona, nina-live's app, with Home Assistant
# behind it). The persona is built first (nina-live scripts/persona-build.sh: her image, Metis); this
# compiles the binary against the nina-live checkout beside this one (a Go workspace outside the repos),
# so the code and the catalog it serves are the same commit. fsttm-live comes from nina-live's go.mod pin
# unless FSTTM_LOCAL=1 (the checkout beside: a change tested before it is released, as the SITL does).
#
#   live/build.sh            → bin/nina
#   REPO_ROOT   the repos side by side (default: this repo's parent)
set -euo pipefail
A=$(cd "$(dirname "$0")/.." && pwd)
R=${REPO_ROOT:-$(dirname "$A")}
M=${METIS_LANG_DIR:-$R/perotheia-packages/metis-lang}
[ -f "$M/runtime/c/metis_rt.h" ] || { echo "no metis-lang runtime at $M (set METIS_LANG_DIR)" >&2; exit 1; }
RTLIB="$M/runtime/build"
[ -f "$RTLIB/CMakeCache.txt" ] || cmake -S "$M/runtime" -B "$RTLIB" > /dev/null
cmake --build "$RTLIB" --target metis_rt -j4 > /dev/null
export PATH=/usr/local/go/bin:$PATH CGO_CFLAGS="-I$M/runtime/c" CGO_LDFLAGS="-L$RTLIB -Wl,-rpath,$RTLIB"
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
use="use (\n\t$A\n\t$R/nina-live\n"
[ "${FSTTM_LOCAL:-}" = 1 ] && use="$use\t$R/fsttm-live\n"
printf "go 1.26.0\n\n$use)\n" > "$W/go.work"
export GOWORK="$W/go.work" GOFLAGS=-mod=readonly
mkdir -p "$A/bin"
(cd "$A" && go build -o bin/nina ./cmd/nina)
# a unit of before the move (a copy naming nina-live/bin/nina, not linked from live/systemd) still finds her
mkdir -p "$R/nina-live/bin" && ln -sfn "$A/bin/nina" "$R/nina-live/bin/nina"
echo "built → $A/bin/nina (nina-live $(git -C "$R/nina-live" rev-parse --short HEAD))"
