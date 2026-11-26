#!/usr/bin/env bash
# update.sh: bring this Nina machine up to date from GitHub (the deployment: acasa). Every repo is
# public, so a machine pulls without credentials; Go fetches the modules itself.
#
#   ~/repo/acasa/install/update.sh             pull, build the persona, apply the home, restart
#   ~/repo/acasa/install/update.sh --kiosk     also install the kiosk's files and restart its Firefox (a Pi)
#   ~/repo/acasa/install/update.sh --no-pull   build and apply what is checked out
#
# The parts, in order:
#   1. acasa itself (fast-forward);
#   2. the persona: nina-live's scripts/persona-build.sh (nina-live, fsttm-live, Metis: pulled and built;
#      it knows nothing of Home Assistant);
#   3. the home: this machine's Home Assistant gets Nina's look and feel (cmd/ha-ui: themes, cards,
#      dashboards; the role in ~/.config/nina/role picks ha-ui/roles/ROLE/dashboards);
#   4. --kiosk: ha-ui/kiosk's files on the Pi (the browser launcher, the starting page, the logo);
#   5. the services enabled here restarted: nina (a Pi), acasa-nina (a desktop), nina-radar.
# A step that fails stops the update before anything is restarted: the running Nina stays as she was.
set -euo pipefail
R=${REPO_ROOT:-$HOME/repo}
export PATH=/usr/local/go/bin:$PATH GOFLAGS=${GOFLAGS:--mod=mod}   # GOTOOLCHAIN as the machine has it: auto fetches the go.mod release where the installed Go is older (Pascal: 1.22)
KIOSK=0; PULL=--pull
for a in "$@"; do
  case "$a" in
    --kiosk) KIOSK=1 ;;
    --no-pull) PULL="" ;;
    *) echo "update.sh: unknown argument $a" >&2; exit 2 ;;
  esac
done

if [ -n "$PULL" ]; then
  before=$(git -C "$R/acasa" rev-parse HEAD)
  git -C "$R/acasa" pull -q --ff-only
  after=$(git -C "$R/acasa" rev-parse HEAD)
  printf '%-34s %s%s\n' acasa "${after:0:7}" "$([ "$before" != "$after" ] && echo "  (was ${before:0:7})")"
fi

echo "== the persona"
REPO_ROOT=$R bash "$R/nina-live/scripts/persona-build.sh" $PULL

echo "== the look and feel (this machine's Home Assistant)"
if [ -s "$HOME/.config/fsttm/hass.token" ]; then
  (cd "$R/acasa" && go run ./cmd/ha-ui -url http://127.0.0.1:8123 -config "$HOME/homeassistant/config" 2>&1 | grep -E "dashboard|themes|rror" || true)
else
  echo "no Home Assistant token yet (~/.config/fsttm/hass.token): the look and feel waits for it (install/README step 4)"
fi

if [ "$KIOSK" = 1 ]; then
  echo "== the kiosk"
  K=$R/acasa/ha-ui/kiosk
  sudo install -m 755 "$K/firefox-kiosk.sh" /usr/local/bin/firefox-kiosk.sh
  sudo install -m 755 "$K/backlight-control.sh" /usr/local/bin/backlight-control.sh
  sudo install -D -m 644 "$K/starting.html" /usr/local/share/ha-pi-kiosk/starting.html
  sudo install -m 644 "$K/logo.png" /usr/local/share/ha-pi-kiosk/logo.png
  # the kiosk shows this machine's own Home Assistant (the repo's file names the first Pi's): the
  # address as this machine has it (localhost: its own kiosk user, install/README; the first Pi:
  # homeassistant.local); a new machine: localhost
  KH=$(grep -o 'KIOSK_URL="http://[^:/"]*' /etc/ha-pi-kiosk/config.env 2>/dev/null | sed 's|.*//||'); KH=${KH:-localhost}
  sed "s|homeassistant.local|$KH|g" "$K/config.env" | sudo install -D -m 644 /dev/stdin /etc/ha-pi-kiosk/config.env
  pkill -x firefox || true
fi

echo "== the services"
any=0
for s in nina acasa-nina nina-radar; do
  if systemctl --user is-enabled -q "$s" 2>/dev/null; then
    any=1
    systemctl --user restart "$s"
  fi
done
sleep 8
for s in nina acasa-nina nina-radar; do
  systemctl --user is-enabled -q "$s" 2>/dev/null && echo "$s: $(systemctl --user is-active "$s")"
done
[ "$any" = 1 ] || echo "no Nina service enabled here (built, not started: install/README step 7)"
