# ha-ui: Nina's look and feel in Home Assistant

Everything that gives the home its look lives here, applied by `go run ./cmd/ha-ui` (from acasa/):
no fork of the projects it uses, unless their insides must change.

| Layer | Here | Applied to |
|---|---|---|
| Raspberry Pi kiosk: which dashboard Firefox opens | `kiosk/config.env` | the Pi's `/etc/ha-pi-kiosk/config.env` (`-kiosk`) |
| Kiosk browser: waits for Home Assistant, 1024x600 | (the Pi's `ha-pi-kiosk/files/firefox-kiosk.sh`, patched) | `/usr/local/bin/firefox-kiosk.sh` |
| Boot appearance | `kiosk/logo.png` (to come) | `ha-pi-kiosk/images/logo.png` |
| Kiosk Mode: hide the header and sidebar | `kiosk_mode:` in `dashboards/nina.yaml` | the dashboard |
| Lovelace: screens, navigation, layout | `dashboards/nina.yaml` | the storage dashboard `/nina-panel` |
| Themes: colours, typography, backgrounds | `themes/nina.yaml` | `config/themes/`, the default theme |
| Custom cards | `vendor.yaml` (kiosk-mode, Bubble Card: pinned, digest-checked) | `config/www/`, resources |
| Nina's view: the page follows her tool calls | `www/nina/nina-view.js`, `www/nina/views.json` | `config/www/nina/`, a resource |
| Nina's card: her state, mic and voice, the conversation | `www/nina/nina-card.js` | `config/www/nina/`, a resource |

Design on Pascal: `ha-ui/preview.sh [view]` opens the dashboard in a Chrome app window at the
panel's size; edit here, `go run ./cmd/ha-ui`, F5.

Nina's card and view talk to her panel (fsttm-live's web plugin, :8770) from Home Assistant's page:
the panel's `allow_origin` (live/pi.yaml) lists Home Assistant's address.

## The boot logo

`kiosk/logo.png` is the Pi's boot splash (ha-pi-kiosk's `images/logo.png`: copy it there and re-run
its `setup.sh`, then reboot). Nina, as Claudia, switching the home on: an AI-generated still
(OpenRouter, openai/gpt-5.4-image-2, from her face sheet; prompt in
nina-live/design/stills/round1/boot.txt). Claudia is an open character by anabology
(claudia.gallery).

## The kiosk's start (2026-11-24)

The Pi boots to its desktop in ~23 s; Home Assistant then takes a minute or more (Docker, the SD
card). So the screen shows Nina from the start:

- `kiosk/logo.png`: the boot splash (Plymouth's ha-pi-kiosk theme; `update-initramfs -u -k all`:
  the Pi 4 boots `initramfs8`, not the 2712 one `plymouth-set-default-theme -R` rebuilds);
- `kiosk/starting.html` (with the logo in `/usr/local/share/ha-pi-kiosk/`): "Nina is waking up",
  opened by `kiosk/firefox-kiosk.sh` at once; it goes to the dashboard when Home Assistant answers;
- `kiosk/backlight-control.sh`: idle on an HDMI panel (no backlight): the output off and on through
  wlr-randr; with it off Firefox stops drawing, Nina's face included;
- cloud-init is off after the first boot (`/etc/cloud/cloud-init.disabled`).

## Nina's own screen (2026-11-24)

`www/nina/shell.html`, served by Nina's panel (`live/*.yaml`: `web.static`, at
`http://homeassistant.local:8770/nina/shell.html`): it is up as soon as Nina is, whatever Home
Assistant is doing. Her card on the left (her persona from her panel, not a Home Assistant sensor);
on the right the `nina-side` dashboard (made by `cmd/ha-ui` from the same YAML, her card taken out),
framed once Home Assistant answers, a clock until then; `nina-view.js` moves it with her tool calls.

Home Assistant's full interface: the ⌂ button, or her panel's `ui` action (`POST /api/do
{"action":"ui","arg":"ha"}`); back with the Nina button, `"nina"`, or after ten minutes (a ten-second
warning anyone can tap away). Home Assistant must allow the frame: its http settings live in
`.storage/http` now (the YAML is ignored), `use_x_frame_options: false` there (done on Pascal and the
Pi, the old file kept as `http.before-frame-20261124`).

The kiosk moves to it when Nina runs on the Pi: `KIOSK_URL="http://homeassistant.local:8770/nina/shell.html"`
(served under homeassistant.local, so the framed Home Assistant keeps the kiosk's login).

## Home Assistant's start (2026-11-24)

`cmd/ha-startup` lists the integrations' start times (Settings → System → Repairs → Integration
startup time); `cmd/ha-entries` lists the config entries and disables or enables one. `default_config`
is replaced by the integrations the house uses (configuration.yaml, Pascal's and the Pi's; the old one
kept as `configuration.yaml.before-trim-20261124`), Bluetooth and go2rtc disabled. The Pi's cold start
did not change with it (Home Assistant answers ~73 s after a reboot: its own start from the SD card);
Nina's own screen is the answer to that.
