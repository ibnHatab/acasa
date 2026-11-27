# acasa — Nina adapted to a home or a role

acasa takes Nina the persona ([nina-live](https://github.com/ibnHatab/nina-live)) and makes her live in one
place: Home Assistant as her integration layer, her look and feel there, her machines' install and update,
and each machine's configuration. nina-live knows nothing about any of this, so the persona can be embedded
elsewhere; acasa is one adaptation (the home, and the office's `secretary` role).

| path | what |
|---|---|
| `hass/` | Home Assistant as her tool (Go): the websocket feed into her world, REST service calls |
| `ha-ui/` | her look and feel: themes, dashboards (`dashboards/`, per role `roles/ROLE/dashboards/`), her cards (`www/nina/`), the kiosk's files (`kiosk/`), applied by `go run ./cmd/ha-ui` |
| `cmd/` | `ha-ui` (apply the look and feel), `ha-startup`, `ha-entries` (Home Assistant's start) |
| `install/` | `sd-firstboot.sh` (a Pi's card), `machine.sh` (a new machine), `update.sh` (every update) |
| `live/` | each machine's configs (`nina-HOST.yaml` her core, `HOST.yaml` her dialogue), systemd units, sound (PipeWire/Pulse echo cancelling), Tailscale, ha-mcp |
| `homeassistant/` | Home Assistant's compose file; `copy-from.sh` moves a whole Home Assistant between machines |
| `skills/` | the cookbook as agent skills (`skills/link.sh` links them into `~/.claude/skills`) |

## Build and deploy

The persona builds in its own repo: `nina-live/scripts/persona-build.sh [--pull]` (nina-live, fsttm-live,
Metis; nothing of Home Assistant). acasa deploys it:

    ~/repo/acasa/install/update.sh [--kiosk] [--no-pull]   # pull, persona build, look and feel, restart her services
    ~/repo/acasa/install/machine.sh                        # a new Pi (the skill acasa-machine-install)

## Skills

`acasa-machine-install`, `acasa-machine-update`, `acasa-role`, `acasa-ha-dashboards`, and the credentials:
`acasa-credentials` with one `acasa-cred-*` per credential (Gemini key, Google OAuth for Home Assistant,
YouTube key, Home Assistant token, OpenRouter key, WhatsApp link). The persona's own skills are in nina-live
(`nina-persona-build`, `-domains`, `-testing`, `-integration`).

## History

The first prototype on the NUC (metis-agent's Python service with Gemma, a Chrome page, an xmonad kiosk:
`run.sh`, `serve.py`, `domains/home/`, `web/`, `kiosk/`) was removed on 2026-11-27; it is in the git
history before that date. Nina's single service (`acasa-nina`, since 2026-11-24) replaced it; `live/run.sh
install` installs that service on a desktop. The office's first catalog workspace (`roles/secretary/catalog`, links into nina-live's), the two services before `acasa-nina` (`acasa-metis-home`, `acasa-nina-live`, fsttm-live's `sources.metis`) and `docs/DIALOG-METIS.md` (the NUC sidecar's design) were removed on 2026-11-27: her rules live in nina-live's catalog and, once merged, in nina-narratives. Research notes: `docs/`, `paper/` (it cites DIALOG-METIS.md at 24e301a).
