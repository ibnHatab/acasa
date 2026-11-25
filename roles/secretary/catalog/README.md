# The office's catalog (Nina as a secretary; pero)

A Metis workspace of its own (metis-loop docs/WORKSPACE.md: a directory that is a catalog, its
`domains/composition.yaml`, its `.metis/`), built on the main catalog (`nina-live/catalog`):

- **Imported as they are** (links into the main catalog): the packages media, scenes, timers, agenda,
  music, habits, persona; the director's domain (`director_domain.llp`); the shared files but the map;
  the character, the persona's settings, the world.
- **The office's own**: `domains/composition.yaml` (name `office`, seven members: no home lights, air,
  comfort, bedroom light), `domains/shared/home_map.llp` (the capacity: its domain type the office's
  members) and `domains/director/director.llp` (the director's instance: who is a specialist, what each
  handles). These are instance facts: Metis's `include … hiding (rule …)` drops rules, not facts, so an
  instance is a file of the workspace including the shared domain (spec 00 §4).
- **To come**: the office's own map (rooms Office and Kitchen, its devices) when nina-live's
  `world/gen_map.py` takes a workspace (today it writes the home's, into the shared packages' words);
  a package the office changes becomes a file here including the main one, `hiding` the rules it
  replaces (a replacement takes a new name: `hiding-shadow` otherwise).

Build: `cd domains && metisc build .` (the image under `build/`). Nina's config: `home.root:
~/repo/acasa/roles/secretary/catalog`.
