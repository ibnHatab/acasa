# acasa — the flat as a metis domain, with a voice

A voice-driven home assistant on the NUC (`nuc`): a small local model (Gemma 4 E2B) turns what
you say into one typed intent, the metis rules of `domains/home` decide what happens and what is
said back, and Home Assistant is only the pipe to the devices. The page (`web/`) is the dashboard
and the dialog in one Chrome tab; the mic is the ReSpeaker array through Chrome's speech
recognition (fsttm-web).

    ./run.sh            # start; then open http://127.0.0.1:8400/world.html in Chrome
    ./run.sh stop | status | log

| path | what |
|---|---|
| `domains/home/home.llp` | the rules: one device on / off (done, already, not answering, not a device), the night and away scenes, the questions |
| `domains/home/home_host.py` | the host: reads the devices back every beat and corrects the belief; actuates on a fired rule. Two backends: `Sim` (a table in memory) and `HA` (Home Assistant's REST API) |
| `domains/home/devices.json` | which Home Assistant entity each device is, and where the token is. While an entity is `null` or the token file is missing, the host simulates |
| `domains/home/intent.yaml` | what a person may ask and how it maps to a command atom; `intent/` is generated from it (`python -m metis.intents gen home`) |
| `domains/home/goldens/` | a scripted day and the intents, with what the package says to them (`python -m metis.catalog golden home`) |
| `web/` | the page: metis-worlds' world page template (`world.html`, `world.js`, `vendor/`: copies), with `home.js` (the device tiles) where the map stands; `home.json` is the page's map file and world card |
| `serve.py`, `run.sh` | the entry to metis-agent's service (py backend): the thread count of this machine, the one domain as a set of one |

## The kiosk (xmonad)

`bash kiosk/setup.sh` installs Chrome, Xorg, xmonad, xmobar and terminator, allows the page the
microphone by Chrome policy, and makes xmonad the session of GDM's automatic login. At login the
service starts and Chrome opens full screen: the loading page while the model loads (about two
minutes), then the dashboard. No screen blanking. `bash kiosk/setup.sh undo` gives GNOME back.

`kiosk/xmonad.hs` is taycann's `~/.xmonad/xmonad.hs` (its keys, tabbed layout and xmobar), changed
only where marked `acasa:`: the dashboard always opens on workspace `1.con`, every other window on
`2.dev`, so nothing takes the focus from the page (win-2 / win-1 to switch); win-shift-r opens the
dashboard again; two prompt calls renamed for xmonad-contrib 0.18.

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
- The service is metis-agent's py backend. The Go backend (llama.cpp over cgo) is built at
  `~/metis/metis-agent/go/bin` but its console does not relay a host's `world/*` frames, which the tiles need.
- `serve.py` wraps the single domain in a `Domains` set: metis-agent's `world_frames()` skips a bare agent.
