#!/usr/bin/env bash
# machine.sh: a Nina machine from a fresh Raspberry Pi OS (trixie) card (install/README.md, step 2;
# written on the office Pi "pero", 2026-11-25). Run on the Pi as nina, from a clone of acasa:
#
#   sudo apt-get install -y -qq git && git clone -q https://github.com/ibnHatab/acasa.git ~/repo/acasa && ~/repo/acasa/install/machine.sh
#   (Lite has no git)
#
# For Raspberry Pi OS **Lite** (64-bit, trixie): the kiosk is ha-pi-kiosk's bare labwc session, as
# on the first Pi (a desktop image would keep its own desktop and taskbar).
#
# Idempotent: run it again after a failure, it skips what is done. It installs and starts:
#   the locale; the packages (cmake, OCaml, Docker, PulseAudio's tools, MPD, …); Go (go.dev's
#   tarball, its sha256 checked); the repos from GitHub; metisc, nina and the radar built
#   (pi-update.sh); Home Assistant (Docker, a fresh config: the person makes its owner account);
#   SearXNG (Docker, local only); the kiosk (ha-pi-kiosk: Firefox on Nina's dashboard, alone on
#   the screen, from boot; its boot splash with Nina's logo; Raspberry Pi Connect); user services
#   kept running without a login (linger).
# Not here (README, step 3 on): Tailscale, Home Assistant's onboarding and integrations, Nina's
# token and keys, her role's catalog workspace and her service.
set -euo pipefail
R=$HOME/repo
export PATH=$PATH:/usr/sbin:/sbin # a user's PATH on Debian lacks them (ha-pi-kiosk looks for plymouth-set-default-theme)
GO_MINOR=${GO_MINOR:-1.26}
HOST=$(hostname)
step() { printf '\n== %s\n' "$*"; }

step "locale (en_US.UTF-8: SSH sessions ask for it)"
if ! locale -a 2>/dev/null | grep -qi '^en_US.utf8$'; then
  sudo sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
  sudo locale-gen >/dev/null
fi

step "packages"
sudo apt-get update -qq
# (trixie: the docker command is docker-cli, only recommended by docker.io: named, recommends being off)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  build-essential cmake ocaml-nox docker.io docker-cli docker-compose pulseaudio-utils mpd mpc sqlite3 jq \
  python3-usb ca-certificates grim >/dev/null # grim: a screenshot of the kiosk over SSH (support)
id -nG | grep -qw docker || sudo usermod -aG docker "$USER"
D="sudo docker" # this session is not in the docker group yet

step "Go $GO_MINOR (go.dev, linux-arm64, sha256 checked)"
want=$(curl -fsSL 'https://go.dev/dl/?mode=json' | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r['version'].startswith('go$GO_MINOR'):
        f=[f for f in r['files'] if f['os']=='linux' and f['arch']=='arm64' and f['kind']=='archive'][0]
        print(r['version'], f['filename'], f['sha256']); break")
read -r gover gofile gosha <<<"$want"
if [ "$(/usr/local/go/bin/go version 2>/dev/null | awk '{print $3}')" != "$gover" ]; then
  curl -fsSL -o "/tmp/$gofile" "https://go.dev/dl/$gofile"
  echo "$gosha  /tmp/$gofile" | sha256sum -c --quiet
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "/tmp/$gofile" && rm "/tmp/$gofile"
fi
/usr/local/go/bin/go version
grep -q /usr/local/go/bin ~/.profile || echo 'export PATH=/usr/local/go/bin:$PATH' >>~/.profile

step "the repos (GitHub, public: no credentials)"
clone() { [ -d "$R/$2/.git" ] || git clone -q -b "$3" "$1" "$R/$2"; echo "$2 $(git -C "$R/$2" log --oneline -1 | cut -c1-60)"; }
mkdir -p "$R/perotheia-packages"
clone https://github.com/ibnHatab/nina-live.git nina-live main
clone https://github.com/ibnHatab/acasa.git acasa main
clone https://github.com/ibnHatab/fsttm-live.git fsttm-live main
clone https://github.com/metis-lang-dev/metis-lang.git perotheia-packages/metis-lang master
clone https://github.com/metis-lang-dev/metis-loop.git perotheia-packages/metis-loop master
clone https://github.com/metis-lang-dev/metis-agent.git perotheia-packages/metis-agent main
clone https://github.com/metis-lang-dev/metis-worlds.git perotheia-packages/metis-worlds main

step "Home Assistant (Docker; a fresh config: its owner account is the person's, at http://$HOST.local:8123)"
mkdir -p ~/homeassistant/config
cp "$R/acasa/homeassistant/compose.yaml" ~/homeassistant/
if [ ! -f ~/homeassistant/config/configuration.yaml ]; then
  cat >~/homeassistant/config/configuration.yaml <<'EOF'
# Home Assistant for Nina (acasa install/machine.sh)
default_config:

frontend:
  themes: !include_dir_merge_named themes   # Nina's theme (acasa ha-ui)

http:
  use_x_frame_options: false   # her own screen frames Home Assistant (acasa ha-ui/www/nina/shell.html)
  use_x_forwarded_for: true    # Tailscale serve, on this machine (acasa live/tailscale-serve.sh)
  trusted_proxies:
    - 127.0.0.1
    - ::1
EOF
  mkdir -p ~/homeassistant/config/themes
fi
(cd ~/homeassistant && $D compose up -d 2>&1 | tail -2)

step "SearXNG (Docker, 127.0.0.1:8888 only: her web search's first backend)"
if [ ! -f ~/searxng/settings.yml ]; then
  mkdir -p ~/searxng
  sed "s|secret_key: \"CHANGE-ME[^\"]*\"|secret_key: \"$(openssl rand -hex 32)\"|" "$R/acasa/live/searxng/settings.yml" >~/searxng/settings.yml
fi
$D inspect searxng >/dev/null 2>&1 ||
  $D run -d --name searxng --restart unless-stopped -p 127.0.0.1:8888:8080 -v "$HOME/searxng:/etc/searxng" searxng/searxng:latest >/dev/null
echo "searxng: $($D inspect -f '{{.State.Status}}' searxng)"

step "the build: metisc, nina, the radar (pi-update.sh; the look and feel waits for Home Assistant's token)"
bash "$R/nina-live/scripts/pi-update.sh" 2>&1 | grep -v "^go: downloading"

step "MPD (her radio: a user service on the default output; Home Assistant's MPD integration at 127.0.0.1)"
sudo systemctl disable --now mpd.service mpd.socket >/dev/null 2>&1 || true # the system-wide one: not hers
mkdir -p ~/.config/mpd/playlists ~/.local/share/mpd ~/Music
[ -f ~/.config/mpd/mpd.conf ] || cp "$R/acasa/live/mpd.conf" ~/.config/mpd/mpd.conf
systemctl --user enable --now mpd.service >/dev/null 2>&1 || systemctl --user restart mpd.service
echo "mpd: $(systemctl --user is-active mpd.service)"

step "the kiosk: ha-pi-kiosk (Raspberry Pi OS Lite: tty1 autologin, a bare labwc, Firefox), then acasa's own files"
# ha-pi-kiosk, vendored in acasa (ha-ui/kiosk/ha-pi-kiosk, VENDOR.md), run from a copy: Nina's logo
# for its boot splash, this machine's settings (the repo's name the first Pi: HOST.local here)
K=$R/acasa/ha-ui/kiosk
T=$(mktemp -d)
cp -r "$K/ha-pi-kiosk/." "$T/"
cp "$K/logo.png" "$T/images/logo.png"
sed "s|homeassistant.local|localhost|g" "$K/config.env" >"$T/config.env" # the kiosk: Home Assistant at localhost (its own user's login, README step 4)
(cd "$T" && echo n | ./setup.sh >/tmp/ha-pi-kiosk.log 2>&1) || { tail -20 /tmp/ha-pi-kiosk.log; exit 1; }
grep "^==>" /tmp/ha-pi-kiosk.log
rm -rf "$T"
# acasa's own over it: Firefox's launcher (Nina's starting page, the dark scheme), the HDMI
# backlight, the starting page, the logo, the settings with their comments
sudo install -m 755 "$K/firefox-kiosk.sh" /usr/local/bin/firefox-kiosk.sh
sudo install -m 755 "$K/backlight-control.sh" /usr/local/bin/backlight-control.sh
sudo install -D -m 644 "$K/starting.html" /usr/local/share/ha-pi-kiosk/starting.html
sudo install -m 644 "$K/logo.png" /usr/local/share/ha-pi-kiosk/logo.png
sed "s|homeassistant.local|localhost|g" "$K/config.env" | sudo install -D -m 644 /dev/stdin /etc/ha-pi-kiosk/config.env

step "user services without a login"
sudo loginctl enable-linger "$USER"

step "done"
cat <<EOF
$HOST is a Nina machine, waiting for its person:
  1. Home Assistant's owner account: http://$HOST.local:8123 (a browser on the network).
  2. Then README step 3 on: Tailscale, the integrations, Nina's token and keys, her role, her service.
EOF
