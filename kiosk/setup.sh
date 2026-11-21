#!/usr/bin/env bash
# acasa's kiosk on this machine: Chrome, Xorg and xmonad installed, xmonad made the login session of
# the automatic login (GDM stays the login manager). Run as the desktop user; asks for sudo once.
#   bash kiosk/setup.sh          install and switch; takes effect at the next login (reboot)
#   bash kiosk/setup.sh undo     the GNOME session again (nothing is uninstalled)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ACC="/var/lib/AccountsService/users/$USER"
session() {   # the session GDM starts for this user
  sudo mkdir -p "$(dirname "$ACC")"
  sudo test -f "$ACC" || printf '[User]\n' | sudo tee "$ACC" >/dev/null
  sudo sed -i '/^\(X\)\?Session=/d' "$ACC"
  sudo sed -i "s/^\[User\]\$/[User]\nSession=$1\nXSession=$1/" "$ACC"
  sudo grep -E '^(X)?Session=' "$ACC"
}
if [ "${1:-}" = undo ]; then session ubuntu; echo "GNOME again at the next login"; exit 0; fi
command -v google-chrome >/dev/null || {
  wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y /tmp/google-chrome.deb
}
sudo apt-get install -y xserver-xorg xinit x11-xserver-utils x11-apps xmonad libghc-xmonad-contrib-dev xmobar terminator xterm suckless-tools scrot
test -f /usr/share/xsessions/xmonad.desktop || { echo "no /usr/share/xsessions/xmonad.desktop: the session was not installed" >&2; exit 1; }
mkdir -p "$HOME/.config/xmonad" "$HOME/.config/acasa"
ln -sfn "$HERE/xmonad.hs" "$HOME/.config/xmonad/xmonad.hs"
ln -sfn "$HERE/xmobarrc" "$HOME/.xmobarrc"
# the microphone for the page, by Chrome's policy (no permission prompt, no command-line flag)
sudo mkdir -p /etc/opt/chrome/policies/managed
echo '{"AudioCaptureAllowedUrls": ["http://127.0.0.1:8400"]}' | sudo tee /etc/opt/chrome/policies/managed/acasa.json >/dev/null
xmonad --recompile
session xmonad
echo "done: reboot (sudo reboot) and the dashboard comes up by itself. Back to GNOME: bash kiosk/setup.sh undo"
