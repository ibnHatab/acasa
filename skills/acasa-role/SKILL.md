---
name: acasa-role
description: Adapt Nina to a new role or place (a home, an office secretary, another person) in acasa — her per-machine configs in live/, her role's dashboards in ha-ui/roles/<role>/, her role's workspace in nina-narratives (workspaces/<role>), and which Google account, calendars, lists and channels the role uses. Use when deploying Nina for someone new, giving a machine a different job, or when a request works on one machine and not another because the role lacks a target.
---

# Giving Nina a role

nina-live is the persona; a **role** is acasa's adaptation of it to one place. The office machine
(`pero`, role `secretary`) is the worked example next to the home (`Pascal`, no role file).

## The four parts of a role

1. **Configs** (acasa `live/`, one pair per machine — start from the closest existing pair):
   - `nina-HOST.yaml`: the core (catalog root, Home Assistant url + token file, tasks, search, MCP,
     `agenda:` targets → this place's entities, `music.languages`, `youtube`, `whatsapp`);
   - `HOST.yaml`: the dialogue (sound devices, models, vocabulary for the place, wake word, panel).
   On the machine, `~/.config/nina/nina.yaml` is usually a symlink to `nina-HOST.yaml`: edit in the
   repo, push, update — never on the machine (it blocks `git pull`).
2. **Dashboards**: `ha-ui/roles/ROLE/dashboards/<name>.yaml` replaces `ha-ui/dashboards/<name>.yaml`
   of the same name; others stay the home's. `echo ROLE > ~/.config/nina/role` on the machine;
   `cmd/ha-ui` (and every update) reads it (`-role` overrides). The office drops the home's lights
   and air cards and shows its account's calendar, tasks and WhatsApp group.
3. **Rules** (her catalog for the role): not in acasa. A role is a workspace of nina-narratives
   (`workspaces/home`, `workspaces/office`: its composition, capacity and director instance over the
   shared units), formalized and gated there. acasa only points the core config's `home.root` at it.
   (Until nina-live takes its members from a composition, every machine runs nina-live's
   `catalog/`; see nina-narratives `RUNTIME.md`.)
4. **Accounts and credentials**: the role's own Google account and Cloud project, its own WhatsApp
   number if any — skills under `acasa-credentials`.

## Decide per role (ask the person)

- Which Google account (her calendar, the person's calendar read-only, task list)?
- Which lists exist? A target with no entity is refused, and said: the office needs no shopping list.
- Which voice languages and radio station languages (`music.languages`)?
- WhatsApp: none, a spare number (`answer: named`, groups to `show`), or the person's primary number
  (`answer: self` only — the "Message yourself" chat).
- Which screens: kiosk tablet (Pi + Firefox) or a desktop browser.

## Check

- `go run ./cmd/ha-ui` logs `role: ROLE` and the role's dashboards.
- A silent wake-cycle round on the machine for each capability the role should have — and one it
  should *not* (e.g. "turn on the lights" in the office: she says there is no such thing).
