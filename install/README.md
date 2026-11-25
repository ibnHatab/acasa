# Installing a Nina machine (Raspberry Pi 4)

The path, written while installing the second one, `pero` (the office, Nina as a secretary;
2026-11-25). Each step says what to run and what to check. The first machine, `nina-home`, got
here by hand; this is the way from now on.

## 1. The card (on a desktop with a card reader)

1. Raspberry Pi OS **Lite** 64-bit (trixie), as on `nina-home`: the kiosk is ha-pi-kiosk's bare
   labwc session (step 2), not a desktop (a desktop image keeps its own taskbar and windows: tried
   on `pero` first, then reflashed). Download it from downloads.raspberrypi.com
   (`raspios_lite_arm64/images/…/…-raspios-trixie-arm64-lite.img.xz`) with its `.sha256`, and check
   it: `sha256sum -c`.
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

## 2. The machine: `install/machine.sh`

On the Pi, as `nina` (SSH from the desktop: `ssh nina@HOST.local`):

```
sudo apt-get install -y -qq git && git clone -q https://github.com/ibnHatab/acasa.git ~/repo/acasa && ~/repo/acasa/install/machine.sh
```

One idempotent command (run it again after a failure: it skips what is done):

- the locale (`en_US.UTF-8`), the packages (build tools, cmake, OCaml for `metisc`, Docker,
  PulseAudio's tools, MPD, `python3-usb` for the ReSpeaker's parameters);
- Go (`go.dev`'s linux-arm64 tarball of the release the code needs, its sha256 checked: Debian's is
  older);
- the seven repos from GitHub (public): `nina-live`, `acasa`, `fsttm-live`, and Metis's
  `metis-lang`, `metis-loop`, `metis-agent`, `metis-worlds`, in `~/repo`;
- Home Assistant in Docker (`~/homeassistant`, a fresh config with Nina's theme folder, framing
  allowed for her own screen, the local proxy trusted for Tailscale), and SearXNG in Docker
  (127.0.0.1:8888 only, its own secret);
- the build through `nina-live/scripts/pi-update.sh`: `metisc`, `nina`, the radar;
- the kiosk: ha-pi-kiosk (vendored: `ha-ui/kiosk/ha-pi-kiosk`, see its `VENDOR.md`): `nina` logged
  in on tty1 at boot straight into a bare labwc session, Firefox alone on the screen (maximized, no
  title bar), the on-screen keyboard, the idle dimming, its boot splash with Nina's logo (the
  firmware's rainbow off), Raspberry Pi Connect; then acasa's own launcher, starting page and
  settings over it (`/etc/ha-pi-kiosk/config.env`: this machine's own `HOST.local`);
- `loginctl enable-linger`: her user services run without a login.

Then reboot once (`sudo reboot`): Nina's logo, then the kiosk alone on the screen; her group
docker counts from then on. Raspberry Pi Connect (remote screen) once, if wanted: `rpi-connect
signin` over SSH, the printed link approved with a Raspberry Pi ID.

Check: the script ends with "is a Nina machine"; after the reboot the screen says "Nina is waking
up…" (her dashboard comes with step 4); `http://HOST.local:8123` shows Home Assistant's
onboarding (its first start takes a few minutes); `docker ps` lists `homeassistant` and `searxng`.

Seen on `pero`: a Pi 4 takes ~25 min for step 2 (most of it the build). Debian trixie splits the
`docker` command (`docker-cli`) from the daemon (`docker.io`): the script names both. Lite has no
`git` (the first command installs it). Over SSH a user's PATH lacks `/usr/sbin` (ha-pi-kiosk's
check for `plymouth-set-default-theme` failed): the script adds it. `grim` takes the kiosk's
screen over SSH: `XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 grim /tmp/s.png`.

## 3. The network: Tailscale

From outside, through the tailnet: Nina's own screen (with the phone's microphone and voice) and
Home Assistant. On the Pi:

```
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update && sudo apt-get install -y tailscale
sudo tailscale up --hostname=HOST          # prints a login link: the person approves the machine
sudo tailscale set --ssh                   # SSH by the tailnet's login: no keys to copy
~/repo/acasa/live/tailscale-serve.sh       # https://HOST.TAILNET.ts.net/ (her screen), :8443 (Home Assistant)
```

Check: `tailscale status` lists the machine; from a device on the tailnet,
`https://HOST.TAILNET.ts.net/` opens her screen (after step 6).

## 4. Home Assistant: the person's accounts

In a browser at `http://HOST.local:8123` (or `https://HOST.TAILNET.ts.net:8443`), the person:

1. makes the owner account (onboarding: name, location, units);
2. adds the integrations her domains use (Settings → Devices & services → Add integration):
   - **Local Calendar** named `Nina` and **Local To-do** named `Nina` (her own calendar and list);
   - **Google Calendar** and **Google Tasks** (the person's: the place's own Google account; an
     OAuth client from Google Cloud as Application Credentials);
   - **Model Context Protocol Server** (her tasks read the log and the history through it);
   - **Music Player Daemon** at `127.0.0.1` (her radio);
   - what the place has: ventilation (Prana), Alexa devices (an Amazon account), lights;
3. makes Nina's token: profile → Security → Long-lived access tokens → Create (`nina`), and puts
   it in `~/.config/fsttm/hass.token` on the Pi (`chmod 600`). Never in a config, never in a chat.

Then her look and feel: `cd ~/repo/acasa && go run ./cmd/ha-ui -url http://127.0.0.1:8123`.

The kiosk's login: a user of its own, not an admin and without a password, signed in only from the
machine itself (the kiosk's Firefox opens `http://localhost:8123`). The person's owner session, in a
browser: `config/auth/create` (name `Kiosk`, group `system-users`, local only); then
`configuration.yaml`'s `homeassistant: auth_providers:` gets `trusted_networks` **first** (`127.0.0.1`
and `::1`, `trusted_users` both that user, `allow_bypass_login: true`: the login page takes the first
provider it offers, and offers this one only to the machine itself), then `homeassistant`. Anyone else,
through the tailnet's proxy too (its forwarded address counts), logs in as usual.

Use the machine's name (`http://HOST.local:8123`), not its IP: the integrations keep the address
they were set up from. Chrome on a Linux desktop does not resolve `HOST.local` (its own DNS client
skips the system's mDNS; Firefox asks the system and finds it): add the name to the desktop's
`/etc/hosts` (`192.168.x.y HOST.local HOST`), and reserve that address for the Pi in the router.

Check: `http://HOST.local:8123/home-panel/home` is in her scheme; the kiosk shows her dashboard.

## 5. Her keys

Files only, `chmod 600`, never in a config or a repository:

- `~/.config/fsttm/gemini.key`: the place's own Google AI Studio key (her voice, ears and Flash:
  its own project, so its quota is its own);
- `~/.config/metis/openrouter.env` (optional): `OPENROUTER_API_KEY=…`, the fallback models.

## 6. Her sound

The ReSpeaker 4-mic array on USB, the speakers on its jack (its echo canceller hears what she
says), about 20 cm apart, the speakers' knob at 50 %. Calibrate (`fsttm-live/scripts/calib/`,
README there): the array's AGC off, her level (`audio.level`, −36 dBFS RMS at the minimum), the
bubble (`prefs.bubble`, the one sound knob for her voice and the music), the barge-in margin.

## 7. Her role and her service

- **The catalog**: at home, the repo's (`nina-live/catalog`). For another role (the office's
  secretary) a workspace of its own: its `domains/` include the main catalog's units (Metis spec 00
  §4: an include lifts a unit's declarations; `include "unit" hiding (rule …)` drops a rule, and
  its replacement takes a new name: a hidden rule re-declared is `hiding-shadow`), its own
  `composition.yaml`, its own `.metis/` for her surprises.
- **Her screens**: her role's dashboards, where they differ from the home's
  (`ha-ui/roles/ROLE/dashboards/`, e.g. the office's `secretary`: no home lights or air, the office
  account's Google calendar and tasks): `echo ROLE > ~/.config/nina/role`, then `go run ./cmd/ha-ui
  -url http://127.0.0.1:8123` (and every `pi-update.sh`) applies them.
- **Her config**: `acasa/live/nina-HOST.yaml` (the core: the log, the catalog, Home Assistant at
  `http://127.0.0.1:8123`, the tasks, the search, the MCP servers) and `acasa/live/HOST.yaml` (the
  dialogue: the sound, the models, the prefs, the panel with `remote: /nina/shell.html` and the
  tailnet's `allow_origin`); start from the first Pi's `nina-pi.yaml` and `pi.yaml`.
- **ha-mcp** (her tasks' configuration tools): `uv tool install --python 3.13 ha-mcp`, then the
  user service `live/systemd/nina-ha-mcp.service`.
- **Her service**: `live/systemd/nina-pi.service` pointed at `nina-HOST.yaml`, linked into
  `~/.config/systemd/user/`, `systemctl --user enable --now nina`.

Check: `journalctl --user -u nina` says the world was rebuilt and Home Assistant connected; her
screen at `http://HOST.local:8770/nina/shell.html` shows her awake when someone says "Nina".

## 8. Updates

Develop on the desktop, push to GitHub; on each machine: `~/repo/nina-live/scripts/pi-update.sh`
(`--kiosk` when the kiosk's files changed): it pulls, rebuilds, applies the look and feel to this
machine's own Home Assistant, restarts what is enabled.
