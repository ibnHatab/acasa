# acasa — the flat as a metis domain, with a voice

A voice-driven home assistant on the NUC (`nuc`): a small local model (Gemma 4 E2B) turns what
you say into one typed intent, the metis rules of `domains/home` decide what happens and what is
said back, and Home Assistant is only the pipe to the devices. The page (`web/`) is the dashboard
and the dialog in one Chrome tab; the mic is the ReSpeaker array through Chrome's speech
recognition (fsttm-web).

    ./run.sh            # start; then open http://127.0.0.1:8400/world.html in Chrome (from another machine: https://nuc.tail2ffd4d.ts.net/world.html, Tailscale serve on the NUC; plain http works but Chrome gives the mic only to https or localhost)
    ./run.sh stop | restart | status | log

| path | what |
|---|---|
| `domains/home/home.llp` | the rules: one device on / off (done, already, not answering, not a device), the night and away scenes, the questions |
| `domains/home/home_host.py` | the host: reads the devices back every beat and corrects the belief; actuates on a fired rule. Two backends: `Sim` (a table in memory) and `HA` (Home Assistant's REST API) |
| `domains/home/devices.json` | which Home Assistant entity each device is, and where the token is. While an entity is `null` or the token file is missing, the host simulates |
| `domains/home/intent.yaml` | what a person may ask and how it maps to a command atom; `intent/` is generated from it (`python -m metis.intents gen home`) |
| `domains/home/goldens/` | a scripted day and the intents, with what the package says to them (`python -m metis.catalog golden home`) |
| `web/` | the page: metis-worlds' world page template (`world.html`, `world.js`, `vendor/`: copies), with `home.js` (the device tiles) where the map stands; `home.json` is the page's map file and world card |
| `serve.py`, `run.sh` | the entry to metis-agent's service (py backend): the thread count of this machine, the one domain as a set of one |

## Nina on the Live API (fsttm-live), with the rules

`live/` runs the next voice: [fsttm-live](https://github.com/ibnHatab/fsttm-live) (`nina-live`: the
ReSpeaker, Gemini Live for hearing and speaking, FSTTM's floor machine) with the home's rules as
its SOURCES: metis-home (perotheia-packages `metis-agent-home`, the `home` world) answers her tools
on 127.0.0.1:8768 and sends its REASONING through her stream door on 127.0.0.1:8766.

    live/run.sh install    # build nina-live, link and enable the systemd user units, start them
    live/run.sh start | stop | restart | status | log | uninstall

Since 2026-11-24 Nina runs as **one** systemd user service, `acasa-nina`. It is
[nina-live](https://github.com/ibnHatab/nina-live)'s `cmd/nina` with `live/nina.yaml`, and it
holds:

- her voice (fsttm-live's `pkg/dialogue`, configured by `live/pascal.yaml`);
- the home's rules (metis-agent's `pkg/metishome`);
- the semantic world, rebuilt from her event log, `~/.local/share/nina/nina.db` (SQLite);
- Home Assistant as her tool (this repo's `hass/`: the websocket feed and the REST device).

Its output is in `journalctl --user -u acasa-nina`, and everything she heard, said and saw is
in the log. `OLD=1 live/run.sh install` brings back the two services that came before it
(`acasa-metis-home`, `acasa-nina-live`). The panel is at http://localhost:8770/.

Home Assistant runs beside them as a container (`homeassistant/compose.yaml`, copied to
`~/homeassistant` on each machine; Pascal: 2026.11.2 on http://localhost:8123). Once its
long-lived token is in `~/.config/fsttm/hass.token` (mode 600), `live/metis-home.sh` starts metis-home
against it: the rules read and switch the real devices through the semantic world, and Home
Assistant's state reaches Nina as ENVIRONMENT (her silent context, one line per entity).

`live/pascal.yaml` is the config (sound, models, preferences, plugins, sources); the panel and the
buttons change its `prefs` and save them there. Without `METIS_HOME_HA` metis-home simulates the
devices. On the Raspberry Pi the same config takes `plugins.gpio` (buttons, lights) and
`prefs.local: rhvoice`.

## The desktop (xmonad)

At login (xmonad, GDM's automatic login) `kiosk/kiosk.sh` opens one ordinary Chrome window with
two tabs: the **Home Assistant dashboard** and **Nina's streams panel** (the ENVIRONMENT, the
REASONING and the CONVERSATION as they run, FSTTM's StreamPanel on http://127.0.0.1:8767/). Not
full screen, not a kiosk (the user, 2026-11-21). The voice is FSTTM (`~/repo/FSTTM`, branch
`cloud-llm`, Gemini) with the Home Assistant feed, as systemd user services `fsttm` and
`fsttm-hass` (`systemctl --user status fsttm fsttm-hass`).

`kiosk/xmonad.hs` is taycann's `~/.xmonad/xmonad.hs` (its keys, tabbed layout and xmobar),
changed only where marked `acasa:` (the startup tabs, win-shift-r to open them again, one
screen for xmobar, two prompt calls renamed for xmonad-contrib 0.18). `bash kiosk/setup.sh`
installs it; `bash kiosk/setup.sh undo` gives GNOME back.

## Connecting the real devices

1. Finish Home Assistant's onboarding (http://nuc.local:8123) and add the devices there.
2. In Home Assistant: your profile → Security → Long-lived access tokens → create one; put it in
   `~/.config/acasa/ha-token` (mode 600). It never goes in this repository.
3. Name each device's entity in `domains/home/devices.json` (e.g. `"light": {"entity": "light.tuya_xxx"}`).
4. `./run.sh stop && ./run.sh`. The page's corner says "through Home Assistant" instead of "simulated devices".

## Changing the rules

`cd ~/repo/acasa && claude`: the Metis plugin (project scope) and the `metis-loop` skill are
installed for this directory. After a change to `home.llp` or `intent.yaml`:

    PY=~/metis/metis-agent/py/.venv/bin/python
    export METISC=~/metis/metis-lang/src/metisc
    $METISC --lint domains/home/home.llp --manifest domains/home/domain.yaml
    $PY -m metis.intents gen home && $PY -m metis.catalog golden home

## Known gaps (2026-11-21)

- On and off only: no brightness, volume, ventilation speed or night mode yet.
- The device names `vent_bedroom` / `vent_lab` are guesses from the Prana units' Bluetooth names.
- The service is metis-agent's py backend. The Go backend (llama.cpp over cgo, `~/metis/metis-agent/go/bin`) was
  measured on this NUC on 2026-11-21 at the same speed (the time is the CPU's token rate, not the language), and its
  console does not relay a host's `world/*` frames, which the tiles need.
- `serve.py` wraps the single domain in a `Domains` set: metis-agent's `world_frames()` skips a bare agent.
