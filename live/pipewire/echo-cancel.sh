#!/usr/bin/env bash
# echo-cancel.sh: Nina's echo canceller on a machine with a separate microphone and speakers (README,
# step 6). Takes the microphone and speakers to put it between (default: the current default source
# and sink), writes ~/.config/pipewire/pipewire.conf.d/60-nina-echo-cancel.conf, restarts PipeWire and
# makes the canceller's sink the default output (the radio through it too).
#   echo-cancel.sh [SOURCE SINK]     echo-cancel.sh off
set -euo pipefail
D=$HOME/.config/pipewire/pipewire.conf.d
F=$D/60-nina-echo-cancel.conf
if [ "${1:-}" = off ]; then rm -f "$F"; systemctl --user restart pipewire pipewire-pulse wireplumber; exit; fi
SRC=${1:-$(pactl get-default-source)} SNK=${2:-$(pactl get-default-sink)}
case "$SRC$SNK" in *nina_ec*) echo "the defaults are the canceller's already: give SOURCE SINK" >&2; exit 1;; esac
mkdir -p "$D"
sed -e "s|@SOURCE@|$SRC|" -e "s|@SINK@|$SNK|" "$(dirname "$0")/nina-echo-cancel.conf.in" >"$F"
systemctl --user restart pipewire pipewire-pulse wireplumber
for i in $(seq 1 20); do pactl list short sinks | grep -q nina_ec_sink && break; sleep 0.5; done
# the defaults and the volumes through WirePlumber (it restores its own over pactl's at a restart):
# the canceller's sink and source the defaults (the radio through it too); its sink and the real one at
# 100 %, the speakers' knob alone sets the loudness (her calibrated level, README step 6)
node() { wpctl status | grep -E " $1( |$)" | grep -o "[0-9]\+\." | head -1 | tr -d .; }
real=$(pactl list short sinks | awk -v s="$SNK" '$2==s{print $1}')
wpctl set-default "$(node nina_ec_sink)"
wpctl set-default "$(node nina_ec_source)"
wpctl set-volume "$(node nina_ec_sink)" 1.0
[ -n "$real" ] && wpctl set-volume "$real" 1.0
echo "canceller: $SRC → nina_ec_source; nina_ec_sink → $SNK"
