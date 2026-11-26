#!/usr/bin/env bash
# echo-cancel-pulse.sh: Nina's echo canceller on a PulseAudio machine with a separate microphone and
# speakers (Pascal's own, while the ReSpeaker array is away: 2026-11-26). PulseAudio's WebRTC canceller,
# no automatic gain (as live/pipewire on pero); its source and sink take pero's names (nina_ec_source,
# nina_ec_sink). Loaded now and at every login (~/.config/pulse/default.pa).
#   echo-cancel-pulse.sh MIC_SOURCE SPEAKER_SINK     echo-cancel-pulse.sh off
set -euo pipefail
PA=$HOME/.config/pulse/default.pa
for m in $(pactl list short modules | awk '$2=="module-echo-cancel" && /nina_ec/ {print $1}'); do pactl unload-module "$m"; done
if [ "${1:-}" = off ]; then
  [ -f "$PA" ] && sed -i '/# nina echo canceller/,+1d' "$PA"
  exit
fi
SRC=$1 SNK=$2
ARGS=(source_master="$SRC" sink_master="$SNK" source_name=nina_ec_source sink_name=nina_ec_sink aec_method=webrtc
  rate=16000 channels=1 'aec_args="analog_gain_control=0 digital_gain_control=0 noise_suppression=1 high_pass_filter=1"'
  source_properties=device.description=Nina_mic_echo_cancelled sink_properties=device.description=Nina_speakers)
pactl load-module module-echo-cancel "${ARGS[@]}" >/dev/null
[ -f "$PA" ] || printf '.include /etc/pulse/default.pa\n' >"$PA"
sed -i '/# nina echo canceller/,+1d' "$PA"
printf '# nina echo canceller (acasa live/pulse/echo-cancel-pulse.sh)\nload-module module-echo-cancel %s\n' "${ARGS[*]}" >>"$PA"
echo "canceller: $SRC → nina_ec_source; nina_ec_sink → $SNK"
