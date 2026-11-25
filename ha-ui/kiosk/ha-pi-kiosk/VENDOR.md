# ha-pi-kiosk, vendored

From https://github.com/wiggs555/ha-pi-kiosk at commit 36b26a4 ("Merge pull request #4 from
wiggs555/boot-logo-splash"), unchanged. It turns Raspberry Pi OS **Lite** into a Home Assistant
wall panel: tty1 autologin → a bare labwc session (`files/labwc`: Firefox maximized and
undecorated, squeekboard, swayidle), the Plymouth logo, the firmware's rainbow off, Raspberry Pi
Connect. The first Pi (`nina-home`) was set up with it by hand; `install/machine.sh` runs its
`setup.sh` from a copy (with Nina's logo and this machine's `config.env`), then puts acasa's own
`firefox-kiosk.sh`, `backlight-control.sh`, `starting.html`, `logo.png` and `config.env`
(`ha-ui/kiosk/`) over its files.

**License**: the repository has no license file (2026-11-25). Fine for our own machines; ask its
author for one before Nina is released publicly.
