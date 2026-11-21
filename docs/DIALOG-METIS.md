# Dialog ↔ Metis: Metis as the conversation's secondary reasoning system

Status: design, 2026-11-21. Nothing here is built yet. It answers the user's investigation note
("Mantis: filtering conversation into probabilistic linear logic"; Mantis = Metis) in terms of what
the Metis repos provide today, and says plainly what is new.

The setting: FSTTM (github ibnHatab/FSTTM, branch `cloud-llm`) runs the voice loop on the NUC —
ReSpeaker → VAD → Whisper → **Gemini 3.1 Flash-Lite** (free-running conversation, `fsttm/cloud.py`) →
Piper. Home Assistant is the device backend and the screen. Metis runs beside the conversation as a
**sidecar**: it is told what the conversation says about its domains, decides what the home may do,
and hands its conclusions back into the model's next turn. Claude Code with the Metis plugin
improves the catalog from what surprised it.

---

## 0. The decisions in one table

| question | decision | rests on |
|---|---|---|
| what the sidecar is | an **unchanged metis-agent domain agent process** serving `domains/home` (JSON lines), no model in it | `metis_agent/domain_agent.py` (`--domain home --case live --consult template --trace --records`), WIRE.md "The domain agent's lines" |
| how Gemini acts on the home | a **tool call per served domain**, its arguments the domain's intent JSON (schema from `intent.yaml`), answered with the domain agent's generic reply | `python -m metis.intents schema home`, DESIGN.md "The generic reply", metispy `metis.domain.mapper` |
| what decides | the **program's rules** (accept or refuse with a reason); never Gemini | `home.llp` `%%` rules; DESIGN.md "the world is changed only through intents" |
| what Gemini may touch directly | reads and non-home services (music, weather); **no Home Assistant device action except through Metis** | §6 |
| what goes back into Gemini | the **reply's `text`** (a rule's `%%` line), refusals with reason/alternatives/the host's words, and a **mirror** block of the domain's state each turn | DESIGN.md "Context" (the mirror region), `home_host.py` `WORDS`/`KEYS` |
| evidence | device readings are the **world** (the host); a person's report is an **intent** that lands as its own atom, never as a reading; the assistant's words are **never** evidence | §3; `PortPlugin` tick/observe contract (`metis/host.py`) |
| probabilities | from the program's **ports and notches** (fitted from records), never from an LLM's confidence | metis-lang spec/16 `beliefs:`/`levels:` (`metis/lang/levels.py`, `catalog/manifests.py:_check_belief`) |
| surprises | written to the **workspace** with the SDK (`Workspace.drop_surprise` / `drop_window`), kinds by spec 20 (`metis.surprise_kind.triage`) | SURPRISE-INTERFACE.md §0, §6 |
| improvement | Claude Code attached through the plugin (`/metis-runtime acasa`), changes land on a **branch through the gate**; the person approves the merge | plugin README ("Catalog changes land on a branch, never main"), metis-loop README (the gate) |

---

## 1. Where the sidecar taps FSTTM

FSTTM's server already has every event needed (`fsttm/server.py`):

| FSTTM event | where | what the sidecar does with it |
|---|---|---|
| the user's final transcript | `_on_transcript(i)` → `_dispatch_command(text, context)` (server.py ~464–474) | **async observer**: candidate extraction (§2) after the turn is sent to Gemini |
| a Gemini tool call | new in `cloud.py` (see §1.2) | **sync path**: a typed intent to the domain agent, wait for its result |
| the assistant's reply | `ResponseDone(full_text)` (server.py ~568, ~985) | kept as **context for coreference only** ("turn *it* off"), never evidence (§3) |
| barge-in, heard text | `_confirm_barge_in()` → `TrimHistory(heard_text)` (server.py ~780–812) | if a cut reply contained a spoken confirmation of an action that the tool already did, nothing changes: the action is the tool's result, not the words |
| a device change | Home Assistant `state_changed` (websocket) → the home host | the **world**: the host's next tick corrects the belief (already how `home_host.py` works with its REST poll) |

### 1.1 Two paths

```
 person ──► Whisper ──► FSTTM ──► Gemini ──(tool call home{…})──► MetisClient ──► domain agent (home)
                          │          ▲                                  │              │ rules fire
                          │          └──── tool result: reply.text ◄────┘              ▼
                          │                                                     home host ──► HA service
                          │
                          └─(async, after Gemini has the turn)──► observer ──► report intents / workspace drops
```

- **Sync (authorization):** anything that changes the home goes Gemini → tool → domain agent → rules.
  The tool returns only when the command is `done`, `refused`, `expired` (the reply kinds of
  DESIGN.md "The generic reply"), or after a timeout of a few beats (`tick_ms` 500 → ~1.5 s), in which
  case it returns `accepted` with the id and the later outcome arrives as a narration line.
- **Async (observation):** every user turn also goes to the observer, which never blocks the reply.
  It extracts reports and novelties (§2.3) and feeds them as report intents or workspace drops.

### 1.2 What FSTTM needs that it does not have (new)

1. `cloud.py`: OpenAI-style **tools** in the request (`tools`, `tool_choice: auto`) and the
   `tool_calls` deltas in the stream; a tool round trip (call → result message → continue the
   reply). Gemini's OpenAI-compatible endpoint takes both.
2. A `MetisClient` (new module, e.g. `fsttm/metis_sidecar.py`): spawns the domain agent process,
   writes its JSON lines, reads its replies, keeps the beat clock (`{"clock": "beat"}` every
   `tick_ms`), routes results by id. The line shapes are the ones the golden day already uses
   (`domains/home/goldens/day.jsonl`: `{"id","domain","verb","args"}`, `{"world": [...]}`,
   `{"tool": "state", "args": {}}`, `{"clock": "beat"}`).
3. A **context block** in the system prompt rebuilt each turn (§4): `cloud.py` already sends the
   whole message list per turn, so this is a string the server passes with `AddSystem`-like
   updates (new message type `SetContext`).

Nothing in the FSTTM turn-taking machine changes.

---

## 2. The extraction contract

### 2.1 The contract already exists: `intent.yaml`

A served domain's `intent.yaml` is the extraction contract Metis already has: the verbs (what can be
asked), the slots (what an intent carries), the **handles** (the words that ground to the program's
constants, with a `fallback` for what does not ground), the **map** (intent → one command atom), and
`outcomes` (what the replier says). The paste proposes a new intermediate representation ("semantic
frames", §3 of the paste); Metis does not need one: the typed intent **is** that IR, and the mapper
(`metis.domain.mapper.Mapper.map`, `resolve`) is the deterministic grounding with type checking —
`{device:device}` only resolves to a handle of kind `device`, anything else goes to the fallback
(`nothing`), and the rule `on_nothing` refuses it with the program's words.

So:

| part | who | how |
|---|---|---|
| choosing the verb and filling the slots from words | **Gemini** | the tool's JSON schema = `python -m metis.intents schema home` (one function per served domain, its description from the domain's `line` and verbs' `meaning`) |
| grounding words to constants | **Metis, deterministic** | the mapper over `handles` (descriptions, `near`, tag ids); fallback handle on no match |
| type checking | **Metis, deterministic** | the mapper's handle kinds; the compiler's types for the atom |
| admission (allowed now?) | **Metis, the rules** | accept / refuse rules with `%%` reasons; the host's pairs for blockers |
| the words back | **Metis** (`text`), then Gemini rephrases inside its reply | the replier: `outcomes`, `%%` lines, `alternatives` |

Gemini never sees atoms, handles or rule names (DESIGN.md orchestrator rule 6: "no atoms, no ports").

### 2.2 Dialogue acts mapped onto Metis

| act (paste) | Metis today | what is new |
|---|---|---|
| REQUEST ("turn on the lab fan") | a typed intent of a command verb (`ON`, `OFF`, `NIGHT`, `AWAY`) → `cmd_*` atom → done/refused | only the tool wrapper |
| QUERY ("is the tv on?") | an `asks:` verb (`QUERY` → `cmd_query(D)` → `query_on/query_off` `%%` line), or a REPL read (`{"tool": "state"}`, `{"tool": "why", …}`) | nothing |
| ASSERT / report ("the light is broken", "I turned the TV off") | **no such verb today** | a `REPORT` verb per domain (`device`, `state`) → `cmd_report(D, S)` → rules that compare it with the reading: agree → `confirmed(D)`; disagree → `disputed(D)` with its `%%` line ("you say the TV is off; it reports on"). The report **never** writes `on/off` (that is the host's). A dispute is a surprise drop of kind *confusion* (§5) |
| CORRECT ("no, the bedroom one") | the enders `cmd_cancel` / `cmd_stop`; DESIGN's bound question (a refused J's retry compares with its tag) | FSTTM keeps the last tool call's id; a correction is cancel(id) + a new intent; the observer only labels it for the metrics |
| CONFIRM / REJECT | DESIGN's `ask(question)` answered bound to its id | the sidecar's refusals carry `alternatives`; Gemini asks; the answer is a new tool call |
| PREFER / policy ("from now on, …") | **never a runtime atom**: rules change only through the loop's gate | the observer drops a **proposal** to the workspace (words + the turn) for Claude Code to formalize as an extension; Gemini says it was noted for review |
| HYPOTHESIZE ("what if I leave now?") | `metis.repl` `snapshot()` / `run(n)` / `restore(token)` (the kernel's undo, repl/__init__.py) | a `what_if` read on the domain agent (not on the wire today); later |
| OTHER (talk, music, the weather) | the domain's `CHITCHAT`/`UNKNOWN` are never dispatched | nothing reaches Metis |

### 2.3 The async observer: what it extracts

Gemini already chose the tool for requests; the observer is about **what the conversation says that
nobody acted on**. Per user turn, after the reply has started:

1. **Cheap filter, deterministic.** A matcher built from every served domain's `handles`
   descriptions, verb words and examples (`intent.yaml`), plus a bypass while a domain frame is open
   (the last tool call ≤ 2 turns ago: "the one by the door" is relevant without a keyword). No match
   and no open frame → nothing more.
2. **Structured extraction, one Gemini call** (non-streamed, `response_format: json_schema`, thinking
   off): the schema is generated from the served manifests — `{act, domain, intent: <the domain's
   intent schema>, unknown_terms: [str]}`, with `act` ∈ {REPORT, REQUEST, QUERY, CORRECT, PREFER,
   HYPOTHESIZE, OTHER}. The prompt is the domains' `line`s and verbs (the same cards the orchestrator
   gets, DESIGN.md "domains block") and the last assistant turn for coreference.
3. **Routing, deterministic:**
   - REPORT → a `REPORT` intent to the domain agent (async: its outcome is a narration only if it is
     a dispute);
   - REQUEST/QUERY the main model did **not** act on → logged as a *missed act* (a metric, and a
     surprise drop of kind *evidential* when it repeats);
   - PREFER → workspace proposal; HYPOTHESIZE → nothing in stage 1;
   - `unknown_terms`, or an intent whose slot fell to the fallback handle (`nothing`) → **ontology
     gap** drop (§5).

The extractor's own confidence is **not** carried anywhere: the mapper either grounds or falls back.
Later, frequent patterns move from step 2 to a local parser (the paste's §9 fast path); the labelled
turns of §7 are its training set.

---

## 3. Provenance and evidence

| source | enters Metis as | can it change a belief? |
|---|---|---|
| a device (HA state, read by the host) | the host's tick do-lines (`+on(D)`, `-off(D) 1`, `+unreachable(D)`): the **world** | yes: it is the reading the watch scores against |
| the person's command | a typed intent → `cmd_*` atom | only through a rule that consumes it, and the host then checks the device obeyed (`home_host.py` `GRACE`: a switch is read back after 3 beats; a device that did not obey is corrected → a kernel surprise) |
| the person's report | a `REPORT` intent → `cmd_report(D, S)` → `reported(D, S)` | **no**: it sits beside the reading; rules compare the two (agree/dispute) |
| the assistant's words | nothing | **no**. The observer reads assistant turns only to resolve "it"/"that one" in the user's next turn. No self-confirmation loop can form, because nothing Gemini says is ever an atom |
| Metis's own conclusions (the projection, §4) | nothing (they are outputs) | no; a later user turn that repeats them is a report like any other, and a report never sets a reading |

When report reliability should matter (a dispute with an unreachable device: who is right?), it
becomes a **belief** in the program: `beliefs: {on: {port: p_on}}` with `levels:` (spec/16, checked by
`catalog/manifests.py:_check_belief`), the host binding `p_on` from the reading's age and the
reports — a weight **fitted from the records** (how often reports and later readings agreed), the
way the RDDL domains fit their notches. Not in stage 1.

---

## 4. The projection back into Gemini

Two forms, both small, both written by Metis (never generated):

**Tool result** (the sync path) — the domain agent's generic reply, cut to what a speaker needs:

```json
{"status": "refused", "text": "I can't turn the tv on: it does not answer on the network.",
 "ask": "check that the TV has power and is on the Wi-Fi", "alternatives": []}
```

`text` is the rule's `%%` line (the replier); `ask` is the host's `words(blocker)` for a world
blocker (`home_host.py` `WORDS`); `alternatives` the replier's. Gemini is told (system prompt): speak
from `text`, never claim an action the result does not say `done`, ask with `ask` when present.

**Mirror block** (every turn, in the system prompt; DESIGN.md "Context", the *mirror* region: "one
line per loaded domain … overwritten in place"):

```
## The home now (Metis)
light off · tv on (since 18:42) · bedroom ventilation on · lab ventilation off
last: 18:42 you asked for the tv → done. 18:44 you said the light is broken → disputed: it reports off and answers.
open: none
```

Built from `{"tool": "state"}` and the session's last outcomes and disputes, ≤ 6 lines; only the
served domains the turn's filter (§2.3 step 1) found relevant are expanded, the rest are one word.
`why` (`{"tool": "why", "args": {...}}`) is answered on demand: a Gemini tool `explain(domain,
question)` → the domain agent's consult with `--consult template` (no model: the harness answers from
the host's words, the cards' moves and the mirror; domain_agent.py `--consult` help).

What is **not** injected: atoms, rule names, the catalog, probabilities that no port computed.

---

## 5. Surprises and the improvement loop

### 5.1 The three kinds of the paste, in spec 20's terms

`metis.surprise_kind.triage` already names a surprise's kind from its trace (metispy
surprise_kind.py, spec 20 §4): confusion, world, ontological, perception, probabilistic,
structural, computational, evidential. The paste's three map onto them:

| paste | source here | spec 20 kind | producer | example |
|---|---|---|---|---|
| perceptual | a device not obeying, or changing by hand | probabilistic / perception | the **kernel watch** of the domain agent (its `surprise` reply, records in `domains/home/records/<session>.jsonl`) | "turn on the light" → done, 3 beats later it reads off |
| semantic (ontology gap) | an unknown term or a fallback-handle refusal | ontological (or world, when the truth's `cannot` lists it) | the **observer**: `Workspace.drop_window(run, k0, k1, words, key, kind=…, source="dialog")` | "switch on the ambient lights" |
| logical | a request refused for a reason the person disputes, or never derivable | structural (`one_guard_away` lists the rule one premise short) | the observer on a refusal followed by a correction/complaint; the person's mark | "why won't it turn the fan on?" |
| — (new) a person disputes the model | a REPORT that disagrees | confusion (a person's mark, step 0) | the observer | "the TV is off" while it reads on |

### 5.2 Where they land

The acasa repository **is** the workspace (metis-loop README: "a loop starts in a directory, and that
directory is the catalog and the workspace"): `~/repo/acasa/.metis/` holds `surprises/`, `traces/`,
`rulings/`, `packs/`, the journal; `domains/home/records/` holds the kernel's records. Every write goes
through metispy's Workspace SDK (SURPRISE-INTERFACE.md §0: "whoever produces a payload writes it into
the workspace first, then signals"). The trace the windows are cut from is the domain agent's run
trace (metis_agent `trace.Tracer`, metis.trace format), started by the sidecar with the session.

### 5.3 Who works on them

```
FSTTM + sidecar  ──writes──►  .metis/surprises/<id>.json, traces/<run>/
       │  RuntimeFeed "acasa" (metis_agent/runtime/feed.py) ── surprise.new ──►  Claude Code on the NUC
       │                                                                          (cd ~/repo/acasa, metis plugin,
       │                                                                           /metis-runtime acasa, skill metis-loop,
       │                                                                           wait_signals)
       ◄── catalog.changed {paths, commit, branch} ────────────────────────────── take → rule → pack → gate → apply (branch)
   sidecar: {"reload": {}, "domain": "home"} after the person approves
```

The sidecar serves the plugin's runtime feed (RUNTIME-INTERFACE.md: `RuntimeFeed`, a named discovery
file `.metis/runtimes/acasa.json`, a small `RuntimeHost` with `findings()`), so Claude Code attaches
**headless**, no page needed; the HA dashboard is not a Metis UI.

### 5.4 Human approval points

1. **A policy the person states** ("from now on …"): Gemini repeats it back and asks; only a yes drops
   the proposal.
2. **Every catalog change** lands on a branch (plugin: "Catalog changes land on a branch, never
   main") after the gate (lint, roundtrip, the golden day rewritten, `replay` fixed: true).
3. **The merge and the reload**: the person approves (a voice "apply the change" is a possible later
   step; first, `git merge` by the person, or a dashboard button); the sidecar reloads with
   `reload: propose` (the manifest's default), never on its own.

A proposed split, to decide (open question 2): **vocabulary** changes (a new `handles` description in
`intent.yaml`: "ambient lights" → `light`) are low risk and could auto-apply after the gate;
**rule** changes (`.llp` extensions) always wait for the person.

---

## 6. Home Assistant and music as tools

| tool Gemini sees | backed by | goes through Metis? |
|---|---|---|
| `home(intent)` (one per served domain) | the domain agent → home host → HA `homeassistant.turn_on/off` | **yes, always** — the only way to change a device |
| `explain(domain, question)` | the domain agent's consult (template seat) | yes (read-only) |
| `music(action, query)` (play, pause, next, volume) | HA `media_player` services, or the music service's own API | **no** in stage 1: no home rule governs music; it becomes a domain when one should ("no music after 23:00", "pause when someone rings") |
| `ha_read(entity_or_question)` (weather, temperature, sensors not in the catalog) | HA REST read | no: reads only, and its answers are not evidence for Metis |

HA's own Assist/device-control tools are **not** given to Gemini (the HA integration route discussed
earlier would bypass the rules). The HA dashboard shows the devices; Metis's mirror is the
assistant's view, not the screen's.

---

## 7. The first experiment, and the build order

### 7.1 Experiment (text only, no audio)

- Catalog: `domains/home` as it is (4 devices, on/off, night/away, query) **plus** the `REPORT` verb
  and its agree/dispute rules: ~25 preds, inside the paste's 20–30.
- 100 scripted user turns (`acasa/eval/turns.jsonl`), each labelled `{act, domain, intent | null,
  atom | null}`: 30 requests (10 with indirect words: "it's too dark in the lab"), 15 queries, 15
  reports (5 disputes), 10 corrections/follow-ups ("no, the other one"), 10 policies/preferences, 5
  hypotheticals, 15 off-topic. Run through FSTTM headless (`fsttm-headless --config … --no-aec`,
  branch `cloud-llm`) with the sidecar on the simulated host.
- Metrics:
  1. **routing recall**: relevant turns that reached the mapper (via the tool or the observer);
  2. **grounding accuracy**: the mapper's atom vs the label (the mapper is deterministic, so this
     measures Gemini's slot words against `handles`);
  3. **act accuracy**: report vs request vs query vs policy;
  4. **reasoning gain**: the same 100 turns with and without the mirror block — follow-up questions
     answered correctly ("did I leave anything on?"), tool calls that were wrong or missing;
  5. **safety**: device actions not through a `done` result (must be 0); assistant words that became
     atoms (must be 0, by construction);
  6. **latency**: words → reply, sync path p50/p95; Gemini calls per turn (free-tier quota).
- Output: a golden-style record (`eval/turns.out.jsonl`), so a later change is compared byte for byte.

### 7.2 Build order (each step usable on its own)

1. **Smallest useful step — Gemini acts only through Metis.** `cloud.py` tool calling; `MetisClient`
   spawning `metis_agent.domain_agent --domain home --case live --consult template --records`; one
   tool `home(intent)` from `metis.intents schema home`; the tool result of §4. Headless test with
   the simulated devices. Gives: rule-checked actions with the rules' reasons, no new Metis code.
2. The **mirror block** per turn (state reads + last outcomes) and the `explain` tool.
3. The home host on **real HA**: `devices.json` entities, HA websocket `state_changed` instead of the
   REST poll (the host's tick stays the reconciliation point).
4. The **observer**: the cheap filter, the extraction call, `REPORT` verb + rules, workspace drops for
   gaps and disputes (SDK `drop_window`).
5. The **runtime feed** and the Claude Code loop on the NUC; approval and reload.
6. The **experiment** of §7.1; then move frequent extraction patterns to a local parser; then beliefs
   with fitted ports for reports.

---

## 8. Where the paste and Metis part ways

| the paste says | in Metis |
|---|---|
| a new IR of "semantic frames" translated into clauses | the typed intent + mapper + handles is that IR already; rules are never generated per turn |
| conditional goals and policies from a sentence become active rules ("rule activation") | rules change only through the loop's gate on a branch, approved by the person; a sentence becomes a proposal |
| `!` for persistent facts, `⊸` clauses written by the observer | LLP uses `$` (kept premises), `bwd` Horn facts and `#init`; the observer writes no clauses at all |
| extraction confidence scores as probabilities; P(user_asleep \| …) rule weights | weights are ports/notches fitted from records (spec/16 beliefs and levels); an LLM's number is never a weight |
| a C++ runtime adapter | the NUC uses metis-agent's Python domain agent over metispy (light: no model in it); the C ABI `libmetis_rt` exists for the Go backend if needed |
| "Mantis decides admission with a deterministic policy" | agreed, and it is the program: refusal rules are the admission policy, with their `%%` reasons |
| three surprise classes | spec 20 already has eight kinds and a triage that reads the trace; the dialog adds producers, not kinds |
| assistant restatements must not count as evidence | agreed; here by construction: the assistant's words never become atoms |

---

## 9. Open questions for the user

1. **Reports**: may a person's report ever change a belief when the device cannot be read (unreachable),
   or does it always stay a report beside the reading?
2. **Auto-apply**: may vocabulary-only changes (`intent.yaml` handles/examples) apply after the gate
   without your approval, with rule changes always waiting for you?
3. **The observer's cost**: a second Gemini call per relevant user turn (free tier, rate limits). Run
   it on every relevant turn, or only on turns where the main model made no tool call?
4. **Music**: which service (HA `media_player` on what device, Spotify Connect on the Echo, a local
   player on the NUC)?
5. **Approval channel**: `git merge` by you, a button on the HA dashboard, or a spoken "apply it" with
   a confirmation?
6. **Tool result timing**: wait up to ~1.5 s for `done` before Gemini speaks (honest, slower), or let
   Gemini say "turning it on" at `accepted` and narrate a refusal afterwards?
