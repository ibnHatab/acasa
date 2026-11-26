---
name: acasa-ha-dashboards
description: Change Nina's look and feel inside Home Assistant (acasa ha-ui) — themes, dashboards YAML, her custom cards (nina-card, nina-cards stage/photos/media, nina-domain-card, nina-expand), vendored frontend modules, the kiosk's browser — and apply them with cmd/ha-ui. Use when editing a dashboard or card, when a card shows the wrong thing, when a change does not appear on a screen, or when the Pi kiosk renders differently from a desktop browser.
---

# Nina's look and feel in Home Assistant (acasa ha-ui)

Everything lives in `acasa/ha-ui/` and is applied idempotently by `go run ./cmd/ha-ui` (from acasa/),
which `install/update.sh` runs on every machine. No forks of upstream projects.

| what | file | becomes |
|---|---|---|
| dashboards | `dashboards/<name>.yaml` (role overrides: `roles/ROLE/dashboards/`) | storage dashboard `/<name>-panel` (`nina` → `/nina-panel`, plus `nina-side` without her card) |
| theme | `themes/nina.yaml` | the default theme |
| her modules | `www/nina/*.js` | `config/www/nina/`, a resource each, `?v=<digest>` |
| third-party | `vendor.yaml` (pinned, digest-checked) | `config/www/` |
| kiosk | `kiosk/` | the Pi's `/usr/local/...`, `/etc/ha-pi-kiosk/config.env` (`update.sh --kiosk`) |

Her cards talk to her panel (`http://HOST:8770`): SSE `/api/events`, `POST /api/do` (see
nina-persona-integration). The panel's `allow_origin` must list Home Assistant's address.

## Edit loop

1. Edit `ha-ui/…`; `node --check www/nina/FILE.js` for syntax.
2. `go run ./cmd/ha-ui -url http://127.0.0.1:8123 -config ~/homeassistant/config`.
3. Reload the page (F5; on a Pi kiosk `wtype -k F5`): an open page keeps old module code.
4. Verify on **the device that shows it** (Chrome for a desktop, a grim screenshot for the kiosk) and
   with JS state where useful (`window.__ninaStage`).

## The cards (www/nina/)

- `nina-card.js` — her portrait, state, mic/voice, the conversation bubbles. Draws `turn.text` only
  (never `turn.context`, her internal note); empty turns draw nothing.
- `nina-cards.js` — the **stage** (videos/photos picture-in-picture, driven by `stage` events and
  `attention told`), `nina-media-card` launchers, `nina-photos-card` (Google Photos album via
  media-source; album names matched case/apostrophe-insensitively), scenes gallery.
- `nina-domain-card.js` — a domain's card that blooms on her tool calls and keeps a short caption;
  timers count down (SET minutes, ALARM to its clock time; a QUERY does not overwrite it).
- `nina-expand.js` — a card opened large over the page (✕ / Escape / backdrop).
- `shell.html` — her own screen (served by the panel), Home Assistant framed beside her card.

## Firefox kiosk vs Chrome

The Pi's kiosk is Firefox on Wayland (software rendering). It painted blurred (`backdrop-filter`)
bubbles **over** a fixed expanded card that Chrome stacked correctly — the user saw a smudge. Cards
now drop backdrop blur in Firefox (`:host([gecko])`, `#nina-expand.gecko`). Prefer opaque layers for
overlays; test overlays on the kiosk itself.

## Home Assistant settings the screens rely on

- **Her own screen frames Home Assistant** (`www/nina/shell.html`, served by her panel at
  `http://HOST:8770/nina/shell.html`): Home Assistant keeps its http settings in `.storage/http` (the
  YAML is ignored) and needs `use_x_frame_options: false` there.
- **The way back to Nina**: on a kiosk every other Home Assistant page gets a floating "Nina" button;
  dashboard resources load only on dashboards, so `configuration.yaml` has `frontend: extra_module_url:
  [/local/nina/nina-boot.js]` (a loader that never changes and imports `nina-view.js` fresh).
- **The boot splash**: `kiosk/logo.png` (Plymouth's ha-pi-kiosk theme; a Pi 4 boots `initramfs8`:
  `update-initramfs -u -k all`), `kiosk/starting.html` ("Nina is waking up") until Home Assistant answers
  (~70 s after a Pi's boot).
- **Start time**: `go run ./cmd/ha-startup` lists the integrations' start times, `cmd/ha-entries` lists
  config entries and disables/enables one; `default_config` may be trimmed to what the place uses
  (keep `my:` for Google OAuth).
- Design on a desktop: `ha-ui/preview.sh [view]` opens the dashboard at the kiosk's size.

## Pitfalls

- A tool result line is not always meant for display (a timers QUERY's "Here is what is set."):
  filter by intent in the card.
- 1024×600 kiosk: check text fits; the stage covers ~64 % width on a wide page, all of a narrow one.
- Home Assistant serves `/local/` with a long cache; the digest in `?v=` changes on content change —
  verify the served file (`fetch(url).then(r=>r.text())`) when in doubt.
