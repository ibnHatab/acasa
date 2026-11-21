"""The home's host, a PortPlugin with no weight ports: the way through to the
devices. Home Assistant is used as a pipe only (its REST API): no rule lives
there. One tick = one beat of the home's day.

- tick: the outcome tokens of the last beat retracted, then the world read
  back: for every device the do-lines that bring the program's belief
  (on | off, reachable | unreachable) to what the device reports. A device
  the home has just switched is not read for GRACE beats: it is given time
  to obey; if it has not by then, the belief is corrected (the program
  predicted on, the world says off: a surprise).
- on_event: a fired `on`, `off` or `scene_off` actuates the device.
- frames: the devices for the page's tiles (world/delta {devices, backend}).

Two backends behind one face (`state(dev)`, `switch(dev, on)`):
- Sim: the devices as a table in memory. The default: used while
  devices.json names no entity for a device or no token file exists.
- HA: Home Assistant's REST API on the same machine (devices.json: url,
  token_file, and each device's entity id).

PURITY: the world changes only in tick/on_event. A real home cannot be
restored: snapshot carries the host's own bookkeeping only."""
import json
import os
import sys
import urllib.error
import urllib.request

OUTCOMES = ("done", "refused", "switched", "kept", "missed")
DEVICES = ("light", "tv", "vent_bedroom", "vent_lab")
GRACE = 3           # beats a switched device is given before it is read back
ACTS = {"on": True, "off": False, "scene_off": False}    # rule -> the state it commands

# the complementary pairs the host keeps current, (needs, blocks)
PAIRS = (
    ("reachable", "unreachable"),    # by device
)

# what the person does to flip a blocking side, in the person's words
WORDS = {"unreachable": "check that {D} has power and is on the Wi-Fi"}
KEYS = {"unreachable": "{D}"}
STANDING = ("nothing",)              # the fallback handle: not a device a person can act on
NAMES = {"light": "the light", "tv": "the TV", "vent_bedroom": "the bedroom ventilation",
         "vent_lab": "the lab ventilation"}

HERE = os.path.dirname(os.path.abspath(__file__))


def _handle(args):
    return args.rstrip(")") if args else ""


def _shown(arg, names):
    return (names or NAMES).get(arg, arg.replace("_", " "))


def key(atom, names=None):
    name, _, args = atom.partition("(")
    k, arg = KEYS.get(name), _handle(args)
    if k is None or arg in STANDING:
        return None
    return k.replace("{D}", _shown(arg, names))


def words(atom, names=None):
    name, _, args = atom.partition("(")
    w, arg = WORDS.get(name), _handle(args)
    if w is None or arg in STANDING:
        return None
    return w.replace("{D}", _shown(arg, names))


def flips(atom):
    name, _, args = atom.partition("(")
    for a, b in PAIRS:
        if name == a:
            return b + ("(" + args if args else "")
        if name == b:
            return a + ("(" + args if args else "")
    return None


class Sim:
    """The devices as a table: every device reachable and off at the start."""
    name = "sim"

    def __init__(self):
        self.on = {d: False for d in DEVICES}
        self.up = {d: True for d in DEVICES}

    def state(self, dev):
        return (self.on[dev], self.up[dev])

    def switch(self, dev, on):
        if self.up[dev]:
            self.on[dev] = on


class HA:
    """Home Assistant as a pipe: read an entity's state, call turn_on / turn_off."""
    name = "ha"

    def __init__(self, url, token, entities, timeout=2.0):
        self.url, self.token, self.entities, self.timeout = url.rstrip("/"), token, entities, timeout
        self.last = {d: (False, False) for d in entities}

    def _call(self, method, path, body=None):
        req = urllib.request.Request(self.url + path, method=method,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + self.token,
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)

    def state(self, dev):
        try:
            s = self._call("GET", "/api/states/" + self.entities[dev]).get("state")
            self.last[dev] = (s not in ("off", "standby", "idle", "unavailable", "unknown"),
                              s not in ("unavailable", "unknown"))
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("  [home host] %s: %s" % (dev, e), file=sys.stderr)
            self.last[dev] = (self.last[dev][0], False)
        return self.last[dev]

    def switch(self, dev, on):
        try:
            self._call("POST", "/api/services/homeassistant/turn_" + ("on" if on else "off"),
                       {"entity_id": self.entities[dev]})
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("  [home host] switch %s: %s" % (dev, e), file=sys.stderr)


def backend(path=None):
    """HA when devices.json names an entity for every device and its token file
    exists; else the simulation."""
    path = path or os.environ.get("METIS_HOME_DEVICES") or os.path.join(HERE, "devices.json")
    try:
        cfg = json.load(open(path))
    except (OSError, ValueError):
        return Sim()
    ents = {d: (cfg.get("devices", {}).get(d) or {}).get("entity") for d in DEVICES}
    tok = os.path.expanduser((cfg.get("ha") or {}).get("token_file", ""))
    if not all(ents.values()) or not os.path.isfile(tok):
        return Sim()
    return HA(cfg["ha"].get("url", "http://127.0.0.1:8123"), open(tok).read().strip(), ents)


class HomeHost:
    script, last = {}, None          # no scripted day: the person and the world are live

    def __init__(self, case, world=None):
        self.beat = 0
        self.due = ()
        self.acted = ()              # (beat, rule, device): the actuation log
        self.hold = {}               # device -> the beat its grace ends
        self.w = world or backend()
        self.view = {}               # device -> {on, up}: what the page's tiles show
        self.fresh = False

    def bind(self, reg):
        pass

    def ports(self):
        return {"backend": self.w.name, "devices": list(DEVICES)}

    def _corrections(self, counts):
        dos = []
        for d in DEVICES:
            if self.hold.get(d, 0) >= self.beat:
                continue
            on, up = self.w.state(d)
            self.view[d] = {"on": on, "up": up}
            for now, yes, no in ((on, "on", "off"), (up, "reachable", "unreachable")):
                want, drop = (yes, no) if now else (no, yes)
                if up or yes == "reachable":       # an unreachable device keeps its last known on | off
                    if counts.get("%s(%s)" % (drop, d)):
                        dos.append("-%s(%s) %d" % (drop, d, counts["%s(%s)" % (drop, d)]))
                    if not counts.get("%s(%s)" % (want, d)):
                        dos.append("+%s(%s)" % (want, d))
        return dos

    def tick(self, counts):
        self.beat += 1
        dos = ["-%s %d" % (a, n) for a, n in sorted(counts.items()) if a.split("(")[0] in OUTCOMES]
        dos += self._corrections(counts)
        self.fresh = True
        return dos

    def frames(self):
        """The page's frames (the service's `frames()` face): the devices as the home holds them,
        once per beat, so a page that connects late is current within a beat."""
        if not self.fresh:
            return []
        self.fresh = False
        return [{"ev": "world/delta", "devices": dict(self.view), "backend": self.w.name}]

    def world(self, lines):
        """Driver lines on the simulated home: `+on(D)`, `+off(D)`, `+reachable(D)`,
        `+unreachable(D)` — somebody switched a device by hand, or it dropped off the
        network. A real home takes none: its devices are the world."""
        if not isinstance(self.w, Sim):
            raise ValueError("the real home takes no world lines: switch the device itself")
        for line in lines:
            name, _, arg = line.lstrip("+").partition("(")
            d = arg.rstrip(")")
            if line.startswith("-") or d not in DEVICES or name not in ("on", "off", "reachable", "unreachable"):
                raise ValueError("world line %r: +on(D) | +off(D) | +reachable(D) | +unreachable(D)" % line)
            if name in ("on", "off"):
                self.w.on[d] = name == "on"
            else:
                self.w.up[d] = name == "reachable"
            self.hold.pop(d, None)

    def sync(self, counts):
        return self._corrections(counts)

    def on_event(self, name, args):
        base = name.split("[")[0].split("-")[0]
        if base in ACTS and args and args[0] in DEVICES:
            self.w.switch(args[0], ACTS[base])
            self.view[args[0]] = {"on": ACTS[base], "up": True}
            self.hold[args[0]] = self.beat + GRACE
            self.acted += ((self.beat, base, args[0]),)

    def snapshot(self):
        return (self.beat, sorted(self.hold.items()), self.acted)

    def restore(self, snap):
        beat, hold, acted = snap
        self.beat, self.hold = beat, dict((d, b) for d, b in hold)
        self.acted = tuple((b, n, d) for b, n, d in acted)


def make(case):
    return HomeHost(case)
