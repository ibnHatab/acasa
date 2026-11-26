---
name: acasa-machine-update
description: Update a running Nina machine (a Pi or a desktop) from GitHub with acasa/install/update.sh — pull, build the persona, apply the Home Assistant look and feel, kiosk files, restart services — and recover when an update leaves Nina down (crash loop, image mismatch, stale kiosk page). Use after merging changes to nina-live, fsttm-live or acasa, when asked to deploy or roll out, or when a machine misbehaves after an update.
---

# Updating a Nina machine

Develop on a desktop, merge to main, push. Then on each machine (over SSH for a Pi):

```sh
~/repo/acasa/install/update.sh            # pull acasa + nina-live, persona build (--pull), look and feel, restart
~/repo/acasa/install/update.sh --kiosk    # also the kiosk's files (launcher, start page, logo) and its Firefox
~/repo/acasa/install/update.sh --no-pull  # what is checked out (testing a local change)
```

What it does, in order — and a failed step stops it **before** any restart, so the running Nina
stays as she was:
1. `git pull --ff-only` acasa, then nina-live (so the persona's build script is the current one);
2. `nina-live/scripts/persona-build.sh --pull` (fsttm-live, Metis repos; metisc if moved; the image
   check; bin/nina; the radar) — persona only, no Home Assistant;
3. `go run ./cmd/ha-ui` against `http://127.0.0.1:8123` and `~/homeassistant/config` (needs
   `~/.config/fsttm/hass.token`; the role from `~/.config/nina/role`);
4. `--kiosk`: files to `/usr/local/...`, `/etc/ha-pi-kiosk/config.env`, Firefox restarted;
5. restarts the user services enabled here: `nina` (Pi), `acasa-nina` (desktop), `nina-radar`.

A script that updates itself: when the update changes `update.sh`, the run that pulled it may finish
as the old version — run it once more to exercise the new path. (The old `nina-live/scripts/pi-update.sh`
is gone: the persona's repo no longer calls the deployment.)

## Check after

- `systemctl --user is-active nina` (or `acasa-nina`) → `active`, still active ~15 s later.
- Her panel: `curl -s http://127.0.0.1:8770/api/state`.
- The kiosk: a screenshot (grim, see nina-persona-testing); `wtype -k F5` reloads its page so new
  cards load (resources carry a digest `?v=`, but an open page keeps the old code until reloaded).
- One silent wake-cycle phrase.

## Recovery

| symptom | cause | fix |
|---|---|---|
| `activating (auto-restart)`, NRestarts climbing | Nina exits at start | `timeout 8 ~/repo/nina-live/bin/nina -config CONFIG` shows the first error line |
| "no image.json, and 2 images in build/" | a stale composition image beside the new one | the build removes superseded images now; by hand: keep only `home.image.v-$(cat image.golden)` in `catalog/domains/build/` |
| "the composition's image (v-X) is not image.golden's" | a rules change without its hash | a nina-live change to commit (nina-persona-build), not a machine fix |
| `git pull` refuses: local changes | someone edited a tracked file on the machine (a config symlinked into acasa `live/`) | look at the diff first (`git diff`, redact secrets); if it is a duplicate of upstream, `git checkout -- FILE`; else commit it upstream |
| `go.mod requires go >= …` | `GOTOOLCHAIN=local` forced with an older Go | leave GOTOOLCHAIN unset (auto) |
| kiosk smudged / overlapping layers | Firefox rendering (backdrop blur), not a crash | check `pgrep -a firefox` uptime; F5; acasa-ha-dashboards |

Note `~/.config/nina/nina.yaml` on a Pi is often a **symlink** into `acasa/live/nina-HOST.yaml`:
editing it edits the repo checkout and blocks the next pull. Change configs in acasa, push, update.
