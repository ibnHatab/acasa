# Installing a Nina machine (Raspberry Pi 4)

The path, written while installing the second one, `pero` (the office, Nina as a secretary;
2026-11-25). Each step says what to run and what to check. The first machine, `nina-home`, got
here by hand; this is the way from now on.

## 1. The card (on a desktop with a card reader)

1. Raspberry Pi OS 64-bit with desktop (trixie): the kiosk is labwc + Firefox, as on `nina-home`.
   Download it from downloads.raspberrypi.com (`raspios_arm64/images/…/…-raspios-trixie-arm64.img.xz`)
   with its `.sha256`, and check it: `sha256sum -c`.
2. Flash it (the card, never the desktop's own disk: check the size and that nothing of it is mounted):
   `xzcat IMAGE.img.xz | sudo dd of=/dev/mmcblkN bs=4M conv=fsync status=progress`
3. Mount the card's `bootfs` and run `install/sd-firstboot.sh /media/$USER/bootfs HOST`: the
   hostname, the user `nina` with this desktop's SSH key and no password, SSH on, the serial port free
   for the radar, cloud-init's files for the first boot.
4. The Wi-Fi: the person writes the SSID and the password into `bootfs/network-config` (never the
   assistant), or plugs a cable. Eject the card.

Check: the first boot takes a few minutes (cloud-init, the root partition grown to the card);
then `ssh nina@HOST.local` answers with the key, and `cloud-init status` says `done`.

Seen on `pero` (a Pi 4 Model B, 4 GB): the firmware's rainbow square stays on screen for a while
on the second HDMI port (HDMI1; only HDMI0, beside the power, shows the boot messages): the desktop
appears there once it is up. `network-config`'s access points: the network's name is the key itself
(`"MyWifi":` with `password:` under it), one entry per network (home and office both: it joins the
one it finds). The first-boot `rpi: interfaces: serial: true` puts a login console back on the
serial port (`console=ttyS0`): taken off in step 2 for a radar.

## 2. The machine (next)

To be written as it is done: Tailscale (`HOST` on the tailnet, Tailscale SSH), Docker and Home
Assistant (its own accounts for an office), the repos from GitHub and `pi-update.sh`, the kiosk,
the catalog workspace of her role (the main catalog's units included, the role's overrides by
`hiding`), her keys, her service.
