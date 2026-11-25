#!/usr/bin/env bash
# sd-firstboot.sh: a freshly flashed Raspberry Pi OS (trixie) card made ready for Nina's machine's
# first boot (the installation path, 2026-11-25; the office Pi "pero" first). Raspberry Pi OS since
# trixie sets itself up on first boot with cloud-init from the boot partition's user-data,
# network-config and meta-data (what Raspberry Pi Imager writes). This writes them:
#
#   the hostname (HOST.local on the network, HOST on the tailnet), the timezone, the keyboard
#   the user nina: no password (log in with an SSH key; set one on the console with `sudo passwd
#     nina` if wanted), sudo without one, the groups a kiosk, the radar's serial port and audio need
#   SSH on, by key only: the key given (default: this machine's ~/.ssh/id_ed25519.pub)
#   the serial port free for the radar (no boot console on serial0)
#   network-config: Wi-Fi with SSID and PASSWORD placeholders: the person fills them in (never this
#     script, never the assistant), or leaves the file out and plugs a cable
#
#   sd-firstboot.sh BOOT_DIR HOST [PUBKEY_FILE]     BOOT_DIR: the card's mounted boot partition (bootfs)
set -euo pipefail
BOOT=${1:?the boot partition of the card, mounted} HOST=${2:?hostname} KEY=${3:-$HOME/.ssh/id_ed25519.pub}
[ -f "$BOOT/config.txt" ] || { echo "$BOOT: not a Raspberry Pi boot partition (no config.txt)" >&2; exit 1; }
PUB=$(cat "$KEY")
cat >"$BOOT/user-data" <<UD
#cloud-config
# Nina's machine $HOST (acasa install/sd-firstboot.sh)
hostname: $HOST
manage_etc_hosts: true
timezone: Europe/Bucharest
keyboard:
  model: pc105
  layout: "us"
users:
  - name: nina
    groups: users,adm,dialout,audio,netdev,video,plugdev,cdrom,games,input,gpio,spi,i2c,render,sudo
    shell: /bin/bash
    lock_passwd: true
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - $PUB
enable_ssh: true
ssh_pwauth: false
rpi:
  interfaces:
    serial: true
UD
cat >"$BOOT/meta-data" <<MD
# cloud-init's meta-data (acasa install/sd-firstboot.sh): local, so user-data is applied before the
# network comes up; a new instance_id makes cloud-init take it as a first boot
dsmode: local
instance_id: $HOST-$(date +%Y%m%d%H%M)
MD
cat >"$BOOT/network-config" <<'NC'
# Wi-Fi for the first boot: replace SSID and PASSWORD (keep the quotes), save, then boot.
# With a cable instead, this file can stay as it is (the Wi-Fi is optional).
network:
  version: 2
  wifis:
    renderer: NetworkManager
    wlan0:
      dhcp4: true
      optional: true
      regulatory-domain: "RO"
      access-points:
        "SSID":
          password: "PASSWORD"
NC
touch "$BOOT/ssh" # the older way to turn SSH on, harmless beside cloud-init
# the serial port is the radar's (LD2410C on /dev/serial0, fsttm-live cmd/radar): no console on it
sed -i 's/console=serial0,[0-9]* //' "$BOOT/cmdline.txt"
who=${PUB##* }
echo "$BOOT: $HOST ready (user nina, key $who); fill in $BOOT/network-config's SSID and PASSWORD, or use a cable"
