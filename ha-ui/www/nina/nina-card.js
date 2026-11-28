// Nina's card (acasa ha-ui, 2026-11-24): Nina herself on the dashboard. Her state from her panel
// (fsttm-live's web plugin, :8770): awake or asleep, listening, thinking, speaking, the floor; the
// mic and her voice, on and off (POST /api/prefs); the conversation as it happens (the event
// stream), as chat bubbles. The bubbles take assist-chat-display's theme variables, so one theme
// styles both. Config: panel (default: this host, port 8770; on https, from the tailnet: this host, 443), max_messages (20), message_max_age
// (s, 300; 0 keeps them), height (a CSS height: the card's, e.g. calc(100vh - 32px) on the panel),
// face (the folder of one persona's frames, or "" for none), personas (the folders' names under
// /local/nina/personas). Which one: ?persona=NAME in the address, else Nina's own (her temperament's
// mood: Home Assistant's sensor.nina_persona, nina-live's persona package), crossfaded when it
// changes; without her, the day's by the date.
//
// Her face (2026-11-24, the user: a talking head, cheap; Claudia's look): five frames drawn as edits
// of one portrait and composited so they differ only at the mouth and the eyes (nina-live
// design/tools/sprites.py). The base never leaves; a mouth or blink frame fades in over it and out
// again, so the crossfades melt instead of ghosting. While she speaks her mouth cycles at random
// (no lip sync), she blinks every few seconds, sways and breathes (a CSS transform); asleep, her
// eyes stay closed; after a reply she may smile. Nothing is computed but a timer and an opacity.
//
// Depth parallax (parallax: true, the default): with WebGL, one shader draws the frames with their
// crossfade weights and shifts each pixel by the persona's depth map (Depth Anything, made once:
// nina-live design/tools/depth.py) along a slow drift, so her head seems to turn a little. It
// measures itself: under 20 frames a second for three seconds (a Pi whose Firefox has no GPU), it
// gives way to the CSS version. Where she looks: a person's direction (viewer, default
// sensor.nina_viewer: its state the angle in degrees, 0 ahead, + to the right as one faces the
// screen; attributes distance in m and elevation in degrees; or window.__ninaHub.look({angle,
// distance, elevation}) from any source, e.g. the panel's radar): fresh (10 s) and she awake, her
// head turns towards them and the idle drift calms. 30 frames a second while she listens or speaks, 15 while she is
// awake and quiet; asleep, her eyes settle closed and drawing stops (no script runs) until she
// wakes; none while the page is hidden. (On the Pi 4, 30 a second cost Firefox ~43% of a core.)
// One hub per page load: one connection to her panel, one conversation, shared by every Nina card
// (each page of the dashboard has its own card: the conversation goes on as the page changes).
// The card's own folder (Home Assistant's /local/nina/, or Nina's panel's /nina/): the personas are there.
const EXPAND = import(new URL(`nina-expand.js?v=m${Math.floor(Date.now() / 60000)}`, import.meta.url)); // a card opened large (its own version: fresh each minute, like nina-boot's)
// one event stream to her panel per page, shared by all of Nina's modules (a browser keeps six
// connections to a host: a stream each, on two pages, left none for her panel's other requests)
const ninaStream = (panel) => ((window.__ninaStreams ||= {})[panel] ||= (() => {
  const t = new EventTarget();
  const open = () => {
    const es = new EventSource(`${panel}/api/events`);
    for (const k of ["ev", "status"]) es.addEventListener(k, (m) => t.dispatchEvent(new MessageEvent(k, { data: m.data })));
    es.onopen = () => t.dispatchEvent(new Event("up"));
    es.onerror = () => { es.close(); t.dispatchEvent(new Event("down")); setTimeout(open, 5000); };
  };
  open();
  return t;
})());
const ASSETS = new URL(".", import.meta.url).pathname;

const hub = window.__ninaHub || (window.__ninaHub = {
  msgs: [], status: null, prefs: null, cards: new Set(), started: false, said: "", nina: null, panel: null,
  persona: null, // Nina's persona now (her temperament: the panel's persona events)
  surprises: null, // {unseen, open}: surprises she has not told about; the domains' records still open
  cue(what) { this.cards.forEach((c) => c.scene?.(what)); }, // a tool, a new persona, a surprise: its scene (scenes.json), where the card shows scenes
  talkUntil: 0, // with her voice off: her face "speaks" her text reply until then (as long as saying it would take)
  quietTalk(text) { if (this.prefs && this.prefs.voice === false && text) this.talkUntil = Math.max(this.talkUntil, Date.now() + Math.min(20000, 600 + text.length * 65)); },
  // one render per frame at most, and at most ~8 a second while her words stream (each render rebuilds
  // the chat: per word, the Fire 7's Chromium 100 dropped a quarter of its frames, 2026-11-27)
  emit() {
    if (this.pending) return;
    const due = Math.max(0, (this.last || 0) + 120 - Date.now());
    this.pending = setTimeout(() => requestAnimationFrame(() => {
      this.pending = 0; this.last = Date.now(); this.cards.forEach((c) => c.render());
    }), due);
  },
  viewer: null, // {angle, distance, elevation, at}: where the person is (the radar's reading)
  presence: null, // {present, near, inReach}: the radar's (sensor.nina_viewer): someone in reach, she attends
  look(v) { this.viewer = Object.assign({}, v, { at: Date.now() }); },
  cur: null,        // the person's turn as it is heard: {cls, parts: [{seq, text, final}]}, until the turn goes to her
  listening: null,  // an utterance open (its seq): the dots, until its words come
  tent: new Set(),  // utterances over her voice: shown only once they are a barge-in
  part(seq) {
    if (!this.cur) { this.cur = { cls: "user", text: "", parts: [], t: Date.now(), live: true }; this.msgs.push(this.cur); if (this.msgs.length > 50) this.msgs.shift(); }
    let p = this.cur.parts.find((x) => x.seq === seq);
    if (!p) { p = { seq, text: "", final: false }; this.cur.parts.push(p); }
    return p;
  },
  joined() { if (this.cur) this.cur.text = this.cur.parts.map((p) => p.text).filter(Boolean).join(" "); },
  drop(seq) { // an utterance that was not the person's words (her echo, a phantom name, kept local asleep)
    if (this.listening === seq) this.listening = null;
    if (this.cur) {
      this.cur.parts = this.cur.parts.filter((p) => p.seq !== seq);
      if (!this.cur.parts.length) { this.msgs = this.msgs.filter((m) => m !== this.cur); this.cur = null; } else this.joined();
    }
    this.emit();
  },
  add(cls, text) {
    if (!text || !text.trim()) return null;
    const m = { cls, text: text.trim(), t: Date.now() };
    this.msgs.push(m);
    if (this.msgs.length > 50) this.msgs.shift();
    this.emit();
    return m;
  },
  start(panel) {
    if (this.started) return;
    this.started = true; this.panel = panel;
    const stream = ninaStream(panel);
    const connect = () => { // her state, at the start and on each reconnect
      fetch(panel + "/api/state").then((r) => r.json()).then((s) => { this.prefs = s.prefs; this.status = s.status; this.persona = s.facts?.persona?.artwork || this.persona; this.surprises = s.facts?.surprises || this.surprises; this.emit(); })
        .catch(() => { this.status = null; this.emit(); });
    };
    {
      const es = stream;
      es.addEventListener("status", (m) => { this.status = JSON.parse(m.data); this.cards.forEach((c) => c.stageDuck?.(this.status)); this.emit(); });
      es.addEventListener("ev", (m) => {
        const e = JSON.parse(m.data);
        switch (e.ev) {
          case "photos_pick": // add_photos (nina-live services/google): the Picker's QR until it ends
            this.pick = e.state === "open" ? e : e.state === "copying" ? Object.assign({}, this.pick, { copying: true }) : null;
            if (e.state !== "open" && e.state !== "copying") this.pickNote = { at: Date.now(),
              text: e.state === "done" ? `${e.copied || 0} photo${e.copied === 1 ? "" : "s"} added to ${e.album || "her album"}` :
                e.state === "expired" ? "the photo picker expired: ask again" : "the photos were not added: " + (e.error || e.state) };
            this.emit(); break;
          case "typed": this.add("user", e.text); break;
          case "vad_start": if (e.tentative) this.tent.add(e.seq); else { this.listening = e.seq; this.emit(); } break;
          case "vad_end": if (this.listening === e.seq) setTimeout(() => { if (this.listening === e.seq) { this.listening = null; this.emit(); } }, 2500); break;
          case "barge_duck": this.tent.delete(e.seq); this.listening = e.seq; this.emit(); break; // a voice over hers: shown from now on
          case "interim":
            if (this.tent.has(e.seq) || !e.text || this.closed?.has(e.seq)) break; // a closed utterance: no new bubble
            if (/^\W*nina\W*$/i.test(e.text.trim()) && /['"‘’“”()]/.test(e.text)) break; // noise transcribed as her name in quotes ('Nina'): not words (it often gets no final to drop it)
            { const p = this.part(e.seq); if (!p.final) { p.text = e.text.trim(); this.listening = null; this.joined(); this.emit(); } }
            break;
          case "heard":
            if (e.tentative) break; // over her voice: echo or barge_in decide
            if (this.closed?.has(e.seq)) { // late: its turn closed the bubble already: the corrected words there (the tablet showed both, 2026-11-27)
              const m = this.closed.get(e.seq);
              if (e.text?.trim() && m.parts?.length === 1) { m.parts[0].text = e.text.trim(); m.text = e.text.trim(); this.emit(); }
              break;
            }
            if (e.late && !this.cur?.parts.some((p) => p.seq === e.seq)) break; // late, and no bubble of its own: nothing new to show
            if (!e.text || !e.text.trim()) { // an empty final (Gemini's transcriber takes back what it wrote at times):
              const p = this.cur?.parts.find((x) => x.seq === e.seq); // the words shown while the person spoke stand, as the ears keep them
              if (p && p.text) { p.final = true; if (this.listening === e.seq) this.listening = null; this.joined(); this.emit(); }
              else this.drop(e.seq); // nothing was shown: no words, no bubble
              break;
            }
            if (/^\W*nina\W*$/i.test(e.text.trim()) && /['"‘’“”()]/.test(e.text)) { this.drop(e.seq); break; } // a noise transcribed as her name in quotes ('Nina'): no turn follows, no bubble
            { const p = this.part(e.seq); p.text = e.text.trim(); p.final = true; if (this.listening === e.seq) this.listening = null; this.joined(); this.emit(); }
            break;
          case "barge_in": { this.tent.delete(e.seq); const p = this.part(e.seq); p.text = (e.heard || "").trim(); p.final = true; this.joined(); this.emit(); break; }
          case "echo": case "phantom_name": case "asleep_local": this.tent.delete(e.seq); this.drop(e.seq); break;
          case "aside": if (this.cur) { this.cur.cls = "user aside"; this.cur.live = false; this.cur = null; this.emit(); } break;
          case "turn":
            if (e.note) { // a NOTE (a task's result): she says it herself next, so the raw note only when her voice is off
              const speaks = window.NinaApp ? window.NinaApp.get("voice") : !!this.prefs?.voice;
              if (!speaks) this.add("note", e.text.replace(/^NOTE \((\w+)\): /, ""));
            }
            else if (/^SAY: /.test(e.text)) { /* Nina's own words handed to her voice (a narration): shown as her reply, not as the person's */ }
            else if (!e.typed_shown) {
              const t = e.text.replace(/^\((You were|You are)[^)]*\)\n/, "").trim(), last = this.msgs[this.msgs.length - 1];
              if (this.cur && t) { // heard as it was spoken: the turn's text settles it (her echo stripped, utterances joined)
                this.closed ||= new Map(); // a late transcript of these utterances corrects this bubble, not a new one
                this.cur.parts.forEach((p) => this.closed.set(p.seq, this.cur));
                if (this.closed.size > 200) this.closed = new Map([...this.closed].slice(-100));
                const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
                if (norm(this.cur.parts.map((p) => p.text).join(" ")) !== norm(t)) this.cur.parts = [{ seq: 0, text: t, final: true }];
                this.cur.parts.forEach((p) => (p.final = true));
                this.cur.live = false; this.joined(); this.cur = null; this.listening = null; this.emit();
              } else if (t && !(last && last.cls === "user" && last.text === t && Date.now() - last.t < 5000)) this.add("user", t); // a typed line: shown already; empty: only her note
            }
            this.nina = null; this.said = ""; break;
          case "said":
            this.said += e.text;
            if (!this.nina) this.nina = this.add("nina", this.said); else { this.nina.text = this.said.trim(); this.emit(); }
            break;
          case "reply_done":
            this.quietTalk(e.said || this.said);
            if (!this.nina && e.said) this.add("nina", e.said); else if (this.nina) { this.nina.text = (e.said || this.said).trim(); this.emit(); }
            this.nina = null; this.said = ""; break;
          case "prefs": this.prefs = e.prefs; this.emit(); break;
          case "persona": if (e.artwork && e.artwork !== this.persona) { const had = this.persona; this.persona = e.artwork; if (had) this.cue("persona"); this.emit(); } break;
          case "surprises": { const was = this.surprises?.unseen || 0; this.surprises = { unseen: e.unseen || 0, open: e.open || 0 }; if (this.surprises.unseen > was) this.cue("surprise"); this.emit(); break; }
          case "tool": this.cue(e.name); this.cards.forEach((c) => c.guest?.(e)); break;
          case "stage": this.cards.forEach((c) => c.stageEv?.(e)); break; // her screen tool: videos, photos, close, ⏮ ⏭ ⏸ ▶
          case "album_photos": this.cards.forEach((c) => c.albumEv?.(e)); break; // an album's photos, asked for by the stage
        }
      });
      es.addEventListener("down", () => { this.status = null; this.emit(); });
      es.addEventListener("up", connect);
    }
    connect();
  },
});


// remote: this device's own microphone and speaker (her screen on a phone, through the tailnet; the
// user, 2026-11-25: talk from the phone while the room's mic is off, or from the room). Her panel's
// /api/audio WebSocket: the microphone up (s16le mono 16 kHz), her voice down (24 kHz); while on,
// she hears this device instead of the room, and speaks here instead of the room. The browser's own
// echo cancelling keeps her voice out of the phone's microphone.
const WORKLET = `registerProcessor("nina-mic", class extends AudioWorkletProcessor {
  process(ins) { const c = ins[0] && ins[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } });`;
const remote = {
  ws: null, mic: false, voice: false, ctx: null, stream: null, src: null, node: null, next: 0, srcs: new Set(), carry: [], panel: "",
  async audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  },
  open() {
    if (this.ws && this.ws.readyState < 2) return;
    const ws = new WebSocket(this.panel.replace(/^http/, "ws") + "/api/audio");
    ws.binaryType = "arraybuffer";
    ws.onopen = () => this.sync();
    ws.onmessage = (m) => {
      if (typeof m.data === "string") { try { if (JSON.parse(m.data).cut) this.flush(); } catch {} return; }
      this.play(m.data);
    };
    ws.onclose = () => { if (this.ws === ws) this.ws = null; if (this.mic || this.voice) setTimeout(() => this.open(), 2000); };
    this.ws = ws;
  },
  sync() { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ mic: this.mic, voice: this.voice })); },
  async toggle(panel, p) {
    this.panel = panel;
    const on = !this[p];
    const ctx = await this.audio(); // a tap: the browsers let sound start only from one
    if (p === "mic") {
      if (on) {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        if (!this.node) await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
        this.src = ctx.createMediaStreamSource(this.stream);
        this.node = new AudioWorkletNode(ctx, "nina-mic");
        const ratio = ctx.sampleRate / 16000;
        let pos = 0;
        this.node.port.onmessage = (e) => { // to 16 kHz (linear), then 20 ms frames of s16le
          const x = e.data, out = [];
          for (; pos < x.length; pos += ratio) {
            const i = Math.floor(pos), f = pos - i, a = x[i], b = i + 1 < x.length ? x[i + 1] : a;
            out.push(a + (b - a) * f);
          }
          pos -= x.length;
          this.carry.push(...out);
          while (this.carry.length >= 320) {
            const fr = this.carry.splice(0, 320), pcm = new Int16Array(320);
            for (let k = 0; k < 320; k++) pcm[k] = Math.max(-32768, Math.min(32767, Math.round(fr[k] * 32767)));
            if (this.ws?.readyState === 1 && this.mic) this.ws.send(pcm.buffer);
          }
        };
        this.src.connect(this.node);
      } else {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.src?.disconnect(); this.node?.port && (this.node.port.onmessage = null); this.node?.disconnect();
        this.stream = this.src = null; this.node = null; this.carry = [];
      }
    }
    this[p] = on;
    if (this.mic || this.voice) this.open(); else this.flush();
    this.sync();
    if (!this.mic && !this.voice && this.ws) { const ws = this.ws; this.ws = null; setTimeout(() => ws.close(), 300); }
  },
  play(buf) { // her voice: 24 kHz s16le, each chunk after the last
    if (!this.voice || !this.ctx) return;
    const pcm = new Int16Array(buf), ab = this.ctx.createBuffer(1, pcm.length, 24000), ch = ab.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const s = this.ctx.createBufferSource();
    s.buffer = ab; s.connect(this.ctx.destination);
    const t = Math.max(this.ctx.currentTime + 0.08, this.next);
    s.start(t); this.next = t + ab.duration;
    this.srcs.add(s); s.onended = () => this.srcs.delete(s);
  },
  flush() { this.srcs.forEach((s) => { try { s.stop(); } catch {} }); this.srcs.clear(); this.next = 0; },
};

class NinaCard extends HTMLElement {
  setConfig(c) {
    this.toggleAttribute("lite", !!c.lite); // a small device: no blur over her face
    this.c = Object.assign({ max_messages: 20, message_max_age: 300 }, c || {});
    this.panel = this.c.panel || (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`);
    if (!this.root) {
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `
<style>
  :host { display: block; }
  ha-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box;
            position: relative; overflow: hidden; }
  ha-card > :not(.face) { position: relative; z-index: 1; }
  .face { position: absolute; inset: 0; z-index: 0; overflow: hidden; background: #d8d4cc; }
  .face[hidden] { display: none; }
  .rig { position: absolute; inset: 0; transform-origin: 50% 62%; will-change: transform;
         animation: sway 9s ease-in-out infinite; transition: rotate .8s ease; }
  .rig.slow { animation-duration: 16s; }
  .rig.fast { animation-duration: 6s; }
  .rig.lean { rotate: 1.2deg; }
  .rig img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%;
             opacity: 0; transition: opacity 70ms linear; }
  .rig img.base, .rig img.on { opacity: 1; }
  .rig.gl { animation: none; rotate: none; }
  .rig.gl img { display: none; }
  .rig canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  ha-card > .guest { position: absolute; left: 12px; right: 12px; bottom: 76px; height: min(440px, 50%); z-index: 4; border-radius: 22px;
                     overflow: hidden; border: 1px solid rgba(233,221,211,.18); box-shadow: 0 12px 40px rgba(0,0,0,.5); background: #14100e; }
  ha-card > .guest[hidden] { display: none; }
  .gimgs img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.2s ease; }
  .gimgs img.on { opacity: 1; }
  .gshade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,16,14,.6) 0%, rgba(20,16,14,.15) 45%, rgba(20,16,14,.8) 100%); }
  .gin { position: absolute; inset: 0; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; color: #e9ddd3; }
  .ghead { display: flex; align-items: center; gap: 10px; }
  .gicon { width: 26px; height: 26px; color: #e9ddd3; } .gicon svg { width: 26px; height: 26px; }
  .gwho { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
  .gtitle { font-size: 1.1em; font-weight: 600; } .gsub { font-size: .85em; opacity: .9; }
  .gbtn { width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 0; background: rgba(20,16,14,.55); color: #e9ddd3;
          display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .gbody { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .gpanel { background: #d97757; color: #fff; border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .gpanel .k { font-size: .8em; opacity: .9; } .gpanel .v { font-size: 1.15em; font-weight: 600; }
  .gbar { background: rgba(20,16,14,.78); border-radius: 999px; height: 56px; padding: 0 6px 0 14px; display: flex; align-items: center; gap: 6px; }
  .gbar .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gbar button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent; color: #e9ddd3; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .gbar button.main { background: #d97757; color: #fff; }
  .gcap { font-size: 1.05em; line-height: 1.4; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
  .gnote { font-size: .8em; opacity: .85; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  ha-card > .stage { position: absolute; left: 12px; right: 12px; bottom: 76px; height: min(440px, 50%); z-index: 4; border-radius: 22px;
                     overflow: hidden; border: 1px solid rgba(233,221,211,.18); box-shadow: 0 12px 40px rgba(0,0,0,.5); background: #000; }
  ha-card > .stage[hidden] { display: block; visibility: hidden; left: -9999px; right: auto; width: 320px; } /* docked: out of sight, its video playing on */
  .sbody { position: absolute; left: 0; right: 0; top: 0; bottom: 60px; }
  .sbody iframe { width: 100%; height: 100%; border: 0; display: block; }
  .sbody img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 1.2s ease; }
  .sbody img.on { opacity: 1; }
  .shead { position: absolute; left: 0; right: 0; top: 0; padding: 12px 12px 18px 16px; display: flex; align-items: center; gap: 10px; color: #e9ddd3;
           background: linear-gradient(to bottom, rgba(20,16,14,.75), transparent); }
  .sctl { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; padding: 0 14px; display: flex; align-items: center; gap: 8px; background: #14100e; color: #e9ddd3; }
  .sctl button { width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 0; background: rgba(233,221,211,.12); color: #e9ddd3; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .sctl button.main { background: #d97757; color: #fff; }
  .scount { margin-left: auto; font-size: .8em; opacity: .75; font-variant-numeric: tabular-nums; }
  @media (orientation: landscape) and (min-width: 700px) { /* the tablet on its side: the card in the right half, Nina on the left */
    ha-card > .guest, ha-card > .stage:not([hidden]) { left: 50%; right: 12px; top: 76px; bottom: 76px; height: auto; } }
  ha-card > .dock { position: absolute; right: 0; top: 22%; z-index: 4; display: flex; flex-direction: column; gap: 8px; }
  .tab { width: 60px; height: 68px; padding: 0; background: rgba(20,16,14,.86); border: 1px solid rgba(233,221,211,.18); border-right: 0;
         border-radius: 16px 0 0 16px; color: #e9ddd3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: inherit; font-size: 11px; cursor: pointer; }
  .tab svg { width: 24px; height: 24px; color: #d97757; }
  .scenebox { position: absolute; inset: 0; opacity: 0; transition: opacity 1s ease; pointer-events: none; }
  .scenebox.on { opacity: 1; }
  .scenebox img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; opacity: 0; transition: opacity 1.2s ease; }
  .scenebox img.on { opacity: 1; }
  .rig img.eyes { transition-duration: 110ms; }
  .rig img.smile { transition-duration: 400ms; }
  @keyframes sway {
    0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1.04); }
    25% { transform: translate(-3px, 1px) rotate(-.6deg) scale(1.046); }
    50% { transform: translate(1px, -2px) rotate(.3deg) scale(1.04); }
    75% { transform: translate(3px, 0) rotate(.7deg) scale(1.044); } }
  .face::after { content: ""; position: absolute; inset: 0;
                 background: linear-gradient(to bottom, rgba(20,16,14,.55) 0, transparent 18%, transparent 55%, rgba(20,16,14,.6) 100%); }
  .credit { position: absolute; left: 10px; bottom: 6px; z-index: 1; font-size: 10px; letter-spacing: .02em;
            color: rgba(255,255,255,.55); }
  .face:not([hidden]) ~ .top .name, .face:not([hidden]) ~ .top .state { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
  .face:not([hidden]) ~ .chat { justify-content: flex-end;
         -webkit-mask-image: linear-gradient(transparent 0, #000 35%); mask-image: linear-gradient(transparent 0, #000 35%); }
  .face:not([hidden]) ~ .chat .b { backdrop-filter: blur(6px); }
  .face:not([hidden]) ~ .chat .user { background: rgba(59, 110, 165, .62); background: color-mix(in srgb, var(--assist-chat-display-user-bubble-background, #3b6ea5) 62%, transparent); }
  .face:not([hidden]) ~ .chat .nina { background: rgba(60, 60, 60, .66); background: color-mix(in srgb, var(--assist-chat-display-assistant-bubble-background, var(--primary-color)) 66%, transparent); }
  .face:not([hidden]) ~ .chat .note { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  /* Firefox (the tablet's kiosk, pero 2026-11-26): its renderer painted the blurred bubbles over a card
     expanded above the page (nina-expand) and the stage; no blur there, the bubbles nearly opaque */
  :host([gecko]) .chat .b, :host([gecko]) .say input, :host([lite]) .chat .b, :host([lite]) .say input { backdrop-filter: none !important; } /* lite: no blur over her face (each of her frames re-blurs it: a small GPU) */
  :host([gecko]) .face:not([hidden]) ~ .chat .user { background: rgb(53, 99, 149); background: color-mix(in srgb, var(--assist-chat-display-user-bubble-background, #3b6ea5) 90%, #000); }
  :host([gecko]) .face:not([hidden]) ~ .chat .nina { background: rgb(40, 40, 40); background: color-mix(in srgb, var(--assist-chat-display-assistant-bubble-background, var(--primary-color)) 90%, #000); }
  .face:not([hidden]) ~ .hint { margin: auto 0 18px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  .top { display: flex; align-items: center; gap: 12px; }
  .orb { width: 42px; height: 42px; border-radius: 50%; flex: none;
         background: radial-gradient(circle at 35% 35%, var(--nina-orb-light, #ffd9a8), var(--nina-orb, #c96f2e));
         box-shadow: 0 0 0 0 var(--nina-orb, #c96f2e); transition: filter .4s, box-shadow .4s; }
  .orb.asleep { filter: grayscale(.8) brightness(.55); }
  .orb.hearing { box-shadow: 0 0 0 6px rgba(201, 111, 46, .35); box-shadow: 0 0 0 6px color-mix(in srgb, var(--nina-orb, #c96f2e) 35%, transparent); }
  .orb.speaking { animation: breathe 1.2s ease-in-out infinite; }
  @keyframes breathe { 50% { box-shadow: 0 0 0 10px rgba(201, 111, 46, .25); box-shadow: 0 0 0 10px color-mix(in srgb, var(--nina-orb, #c96f2e) 25%, transparent); } }
  .who { flex: 1; }
  .name { font-size: 1.25em; font-weight: 500; color: var(--primary-text-color); }
  .state { color: var(--secondary-text-color); font-size: .9em; }
  .toggles { display: flex; gap: 8px; }
  /* fallbacks: on her own screen (shell.html) there is no Home Assistant theme, and the buttons had no
     background at all: on or off could not be told (the user, 2026-11-26) */
  button { border: 0; border-radius: 999px; padding: 8px 14px; font: inherit; cursor: pointer;
           background: var(--secondary-background-color, rgba(255,255,255,.14)); color: var(--secondary-text-color, rgba(255,255,255,.72));
           box-shadow: 0 1px 3px rgba(0,0,0,.35); }
  button.on { background: var(--primary-color, #d97757); color: var(--text-primary-color, #fff); }
  button:disabled { opacity: .35; cursor: default; }
  button.ha { padding: 6px 11px; font-size: 1.15em; line-height: 1; }
  .flag { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; font-size: .7em; font-weight: 600;
          background: #d97757; color: #fff; cursor: pointer; vertical-align: middle; text-shadow: none; }
  .flag.quiet { background: rgba(255,255,255,.18); font-weight: 400; }
  .chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--assist-chat-display-gap, 8px);
          font-size: var(--assist-chat-display-font-size, 16px); min-height: 80px; }
  .b { max-width: 82%; padding: var(--assist-chat-display-padding, 8px) 12px; border-radius: var(--assist-chat-display-radius, 20px);
       line-height: 1.35; white-space: pre-wrap; }
  .user { align-self: flex-end; background: var(--assist-chat-display-user-bubble-background, var(--blue-color, #3b6ea5));
          color: var(--assist-chat-display-user-bubble-color, #fff); }
  .nina { align-self: flex-start; background: var(--assist-chat-display-assistant-bubble-background, var(--primary-color));
          color: var(--assist-chat-display-assistant-bubble-color, #fff); }
  .b .seg.live { opacity: .62; font-style: italic; }       /* progressive recognition: words still forming */
  .b .cut { display: inline-block; width: 1px; height: .9em; margin: 0 7px; vertical-align: -1px; background: currentColor; opacity: .45; } /* an utterance split (FSTTM) */
  .b.live { opacity: .92; }
  .b.listening { align-self: flex-end; padding: 6px 12px; background: rgba(59,110,165,.45); color: #fff; letter-spacing: 3px; }
  .b.listening::after { content: "•••"; animation: ninadots 1.2s infinite steps(4); }
  @keyframes ninadots { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
  .user.aside { opacity: .55; font-style: italic; }
  .note { align-self: center; background: transparent; color: var(--secondary-text-color); font-style: italic; font-size: .9em; }
  .off { color: var(--secondary-text-color); font-size: .85em; text-align: center; }
  .hint { margin: auto; color: var(--secondary-text-color); text-align: center; line-height: 1.6; opacity: .8; }
  .chat:not(:empty) + .hint { display: none; }
  .pick { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 3; text-align: center;
          background: rgba(0,0,0,.72); color: #fff; padding: 14px; border-radius: 14px; width: min(86%, 280px); box-sizing: border-box; }
  .pick[hidden] { display: none; }
  .pick img { width: 220px; height: 220px; background: #fff; padding: 10px; border-radius: 12px; display: block; margin: 0 auto 8px; }
  .pickn { font-size: .92em; line-height: 1.35; }
  .say { display: flex; gap: 8px; } .say[hidden] { display: none; }  /* typed to her (remote: away from her mic) */
  .say input { flex: 1; min-width: 0; font: inherit; color: #fff; background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.25);
               border-radius: 999px; padding: 9px 14px; backdrop-filter: blur(6px); }
  .say button { border: 0; border-radius: 999px; padding: 0 16px; background: var(--primary-color, #d97757); color: #fff; font: inherit; cursor: pointer; }
</style>
<ha-card>
  <div class="face" hidden><div class="rig"></div><div class="scenebox"></div></div>
  <div class="guest" hidden><div class="gimgs"></div><div class="gshade"></div>
    <div class="gin"><div class="ghead"><span class="gicon"></span><div class="gwho"><span class="gtitle"></span><span class="gsub"></span></div>
      <button class="gbtn gdock" title="To the edge" aria-label="Minimize to the edge"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="gbtn gclose" title="Close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="gbody"></div><div class="gnote"></div></div></div>
  <div class="stage" hidden><div class="sbody"></div>
    <div class="shead"><span class="gicon"></span><div class="gwho"><span class="gtitle"></span><span class="gsub"></span></div>
      <button class="gbtn sdock" title="To the edge" aria-label="Minimize to the edge"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="gbtn sclose" title="Close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sctl"><button data-f="prev" title="Previous" aria-label="Previous"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
      <button class="main" data-f="play" title="Play or pause" aria-label="Play or pause"></button>
      <button data-f="next" title="Next" aria-label="Next"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      <span class="scount"></span></div></div>
  <div class="dock"></div>
  <div class="top"><div class="orb asleep"></div>
    <div class="who"><div class="name">Nina <span class="flag" hidden></span></div><div class="state">…</div></div>
    <div class="toggles"><button data-p="mic">mic</button><button data-p="voice">voice</button><button class="ha" title="Home Assistant: add and configure devices">⌂</button><button class="addph" title="Add photos: Google Photos' picker, into her album" style="display:none">photos</button><button class="radiost on" title="Stop the radio" style="display:none">■ radio</button></div></div>
  <div class="pick" hidden><img alt="QR code: open Google Photos' picker"><div class="pickn"></div></div>
  <div class="chat"></div>
  <div class="hint">Say “Nina”, or tap the mic.</div>
  <form class="say" hidden><input placeholder="Write to Nina…" enterkeyhint="send" autocomplete="off"><button>Send</button></form>
  <div class="credit" hidden>Claudia by anabology · AI-generated</div>
</ha-card>`;
      setTimeout(() => this.face(), 0); // after Home Assistant gives the card its states (her persona)
      if (this.c.input) { // config input: true (her screen, remote): a line typed to her, as if said
        const f = this.root.querySelector(".say"), i = f.querySelector("input");
        f.hidden = false;
        this.root.querySelector(".hint").textContent = "Write to her below.";
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          const t = i.value.trim();
          if (!t) return;
          i.value = "";
          this.api("/api/do", { action: "type", arg: t }).catch(() => {});
        });
      }
      if (this.c.height) this.root.querySelector("ha-card").style.height = this.c.height;
      this.root.querySelectorAll("button[data-p]").forEach((b) =>
        b.addEventListener("click", async () => {
          const was = window.NinaApp ? window.NinaApp.get(b.dataset.p) : !!hub.prefs?.[b.dataset.p];
          this.toggle(b.dataset.p);
          if (was) return; // turned off: nothing to open
          // on a Home Assistant dashboard (not her own screen, not opened large already): the mic brings
          // her card up large, the conversation readable while you talk (the user, 2026-11-25)
          if (b.dataset.p === "mic" && !this.c.expanded && !window.__ninaShell && !location.pathname.startsWith("/nina-")) {
            const { expand, card } = await EXPAND;
            expand(card("nina-card", { ...this.c, expanded: true, height: "min(86vh, 640px)" }));
          }
        }));
      // ⌂: Home Assistant's full interface (on Nina's own screen its mode; on a Home Assistant
      // dashboard, its default dashboard, the sidebar there leads back to hers)
      // ⚑: what surprised her (asked as if typed: she answers with the explain tool's SURPRISES)
      this.root.querySelector(".flag").addEventListener("click", () =>
        this.api("/api/do", { action: "type", arg: "What surprised you?" }).catch(() => {}));
      if (!this.c.expanded && !window.NinaApp) { // a single click on her orb: her card large (not in her app: it is large)
        const orb = this.root.querySelector(".orb");
        orb.style.cursor = "pointer"; orb.title = "Nina, large";
        orb.addEventListener("click", async () => {
          const { expand, card } = await EXPAND;
          expand(card("nina-card", { ...this.c, expanded: true, height: "min(86vh, 640px)" }));
        });
      }
      if (window.NinaApp || this.c.home === false) this.root.querySelector("button.ha").style.display = "none"; // no Home Assistant here
      { // the guest card's own controls (the layer works in her app, or with config guests: true)
        const gq = (s) => this.root.querySelector(s);
        gq(".guest").addEventListener("click", () => this.guestTouch());
        gq(".gdock").addEventListener("click", (ev) => { ev.stopPropagation(); this.guestMin(); });
        gq(".gclose").addEventListener("click", (ev) => { // ×: closed; the radio stops with it (a Clock timer cannot be cancelled from here: its tab stays)
          ev.stopPropagation();
          const k = this.openGuest;
          if (k === "music") { window.NinaApp?.set("radio", false); this.guestEnd("music"); }
          else if (k === "info") this.guestEnd("info");
          else this.guestMin();
        });
      }
      { // the stage's own controls (videos, photos): ⏮ ⏸ ▶ ⏭, to the edge, ×
        const sq = (x) => this.root.querySelector(x);
        sq(".sdock").addEventListener("click", () => this.stageMin());
        sq(".sclose").addEventListener("click", () => this.stageEnd());
        this.root.querySelectorAll(".sctl button").forEach((b) => b.addEventListener("click", () => this.stageAct(b.dataset.f)));
        let x0 = null; // a swipe right: to the edge
        sq(".stage").addEventListener("touchstart", (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
        sq(".stage").addEventListener("touchend", (ev) => { if (x0 !== null && ev.changedTouches[0].clientX - x0 > 80) this.stageMin(); x0 = null; });
      }
      if (window.NinaApp) // her app's radio: a stop button while it plays (even when she cannot answer)
        this.root.querySelector("button.radiost").addEventListener("click", () => { window.NinaApp.set("radio", false); setTimeout(() => this.showPrefs(), 300); });
      if (this.c.add_photos) { // config add_photos: Google Photos' picker into her album (its QR: photos_pick); not in her app's bar (the user, 2026-11-28: its own design later)
        const ph = this.root.querySelector("button.addph");
        ph.style.display = "";
        ph.addEventListener("click", () => this.api("/api/do", { action: "pick_photos", arg: "" })
          .then((r) => { if (r?.error) this.state("no picker: " + r.error); else this.state("opening the photo picker…"); })
          .catch(() => this.state("her panel is not reachable")));
      }
      this.root.querySelector("button.ha").addEventListener("click", () =>
        window.__ninaShell ? window.__ninaShell.mode("ha") : (history.pushState(null, "", "/home-panel/home"), // no reload: no splash
          window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }))));
      hub.start(this.panel);
      setInterval(() => this.render(), 5000);
    }
  }
  connectedCallback() { if (/Firefox\//.test(navigator.userAgent)) this.setAttribute("gecko", ""); hub.cards.add(this); if (this.root) this.render(); this.animate(true); this.gl?.start(); }
  disconnectedCallback() { hub.cards.delete(this); this.animate(false); this.gl?.stop(); }
  // face builds the frames' stack (the base, then the overlays).
  face(want) {
    let dir = this.c.face;
    if (dir === undefined) {
      const names = this.c.personas || ["graphite", "contact", "inkblue", "booth", "snapshot", "sketch", "tinted", "porcelain"];
      const asked = new URLSearchParams(location.search).get("persona");
      const hers = this._hass?.states?.["sensor.nina_persona"]?.state;
      const d = new Date(), day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      const name = [asked, want, hub.persona, hers].find((n) => names.includes(n)) || names[(day * 7 + d.getFullYear()) % names.length];
      this.persona = name; this.pinned = names.includes(asked); this.names = names;
      dir = `${ASSETS}personas/${name}`;
    }
    if (!dir) return;
    const rig = this.root.querySelector(".rig");
    this.frames = {};
    for (const [name, cls] of [["neutral", "base"], ["talk-a", "mouth"], ["talk-b", "mouth"], ["smile", "smile"], ["blink", "eyes"]]) {
      const img = document.createElement("img");
      img.src = `${dir}/${name}.webp`; img.className = cls; img.alt = "";
      img.onerror = () => { img.remove(); delete this.frames[name]; }; // a persona without this frame yet
      rig.appendChild(img); this.frames[name] = img;
    }
    this.depth = new Image(); this.depth.src = `${dir}/depth.webp`;
    this.frames.neutral.onload = () => { this.root.querySelector(".face").hidden = false; this.root.querySelector(".credit").hidden = false; };
    this.target = {};
    if (this.isConnected) this.animate(true); // the mouth and the blinks (the card was attached before its frames)
    if (this.c.parallax !== false) Promise.all([...Object.values(this.frames), this.depth].map((i) => i.decode().catch(() => null)))
      .then(() => this.gl3d()).catch((e) => console.warn("nina-card: parallax off:", e));
  }
  // scene: her domain scene for a tool, a new persona or a surprise (scenes/scenes.json: the user's
  // Codex scenes), frame after frame over her face, then her face again. Only with scenes: true (or
  // ?scenes=1 in the address): off until they are reviewed (scenes.html).
  async scene(what) {
    const on = this.c.scenes === true || new URLSearchParams(location.search).get("scenes") === "1";
    if (!on || !this.frames) return;
    this.scenes ||= await fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => null);
    const sc = this.scenes;
    const name = sc && (sc.tools[what] || sc.events[what]);
    const n = name && sc.frames[name];
    if (!n) return;
    const box = this.root.querySelector(".scenebox");
    clearTimeout(this.sceneEnd); (this.sceneSteps || []).forEach(clearTimeout);
    box.replaceChildren(...Array.from({ length: n }, (_, i) => { const im = document.createElement("img"); im.src = `${ASSETS}scenes/${name}/${i + 1}.webp`; im.alt = ""; return im; }));
    const imgs = [...box.children];
    box.classList.add("on");
    this.sceneSteps = imgs.map((im, i) => setTimeout(() => imgs.forEach((x) => x.classList.toggle("on", x === im)), 50 + i * sc.frame_seconds * 1000));
    this.sceneEnd = setTimeout(() => box.classList.remove("on"), Math.max(sc.show_seconds, n * sc.frame_seconds + 2) * 1000);
  }
  // ---- guests: the cards over her face in her app (the user's design, 2026-11-28) ----------------
  // A tool's card opens over her lower half with its scene (scenes.json: its frames once, held on the
  // last); a card with something running (the radio, a timer) docks to a still tab on the right edge
  // after 8 s untouched; one with nothing running closes after show_seconds. No animation but the
  // scene's crossfades when it opens; a tab is a still icon and a word (a timer's: its time left).
  async guest(e) {
    if (!window.NinaApp && !this.c.guests) return;
    this.scenes ||= await fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => null);
    const sc = this.scenes || { tools: {}, frames: {}, frame_seconds: 2.5, show_seconds: 12 };
    const tablet = { radio: "music", alarm: "timers", timer: "timers" }; // her app's own tools
    const scene = tablet[e.name] || sc.tools[e.name];
    if (!scene) return;
    const kind = scene === "music" ? "music" : scene === "timers" ? "timers" : "info";
    const st = e.result?.status || "";
    if (st === "error" || st === "refused") return; // her words say why; nothing to show
    this.guests ||= {};
    if (kind === "music") {
      if (e.args?.action === "stop") { this.guestEnd("music"); return; }
      if (e.args?.action === "volume" && this.guests.music) { this.guestTouch(); return; }
      const name = String(e.result?.text || "").replace(/^playing\s+/i, "") || "the radio";
      this.guests.music = { kind, scene, title: "Music", sub: "ask for a kind of music, a station, or “something”", station: name, at: Date.now() };
    } else if (kind === "timers") {
      let end = 0, label = e.args?.label || "";
      if (e.name === "alarm" && /^\d{1,2}:\d{2}$/.test(e.args?.time || "")) {
        const [h, m] = e.args.time.split(":").map(Number), d = new Date(); d.setHours(h, m, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1); end = +d;
      } else if (+e.args?.minutes > 0) end = Date.now() + e.args.minutes * 60000;
      this.guests.timers = { kind, scene, title: e.name === "alarm" ? "Alarm" : "Timer", sub: label || (e.result?.text || ""), end, alarm: e.name === "alarm", at: Date.now() };
    } else {
      this.guests.info = { kind, scene, title: scene.charAt(0).toUpperCase() + scene.slice(1), sub: "", text: e.result?.text || "", at: Date.now() };
    }
    this.guestOpen(kind === "info" ? "info" : kind, sc);
  }
  guestOpen(key, sc) {
    sc ||= this.scenes || { frames: {}, frame_seconds: 2.5, show_seconds: 12 };
    if (key === "stage") { this.stageShow(); return; }
    const g = this.guests[key], box = this.root.querySelector(".guest");
    if (this.stg && !this.stg.min) this.stageMin(); // one card over her face: the stage goes to its tab
    this.openGuest = key;
    const n = sc.frames[g.scene] || 1, imgs = this.root.querySelector(".gimgs");
    imgs.replaceChildren(...Array.from({ length: n }, (_, i) => { const im = document.createElement("img"); im.src = `${ASSETS}scenes/${g.scene}/${i + 1}.webp`; im.alt = ""; return im; }));
    const all = [...imgs.children];
    (this.gSteps || []).forEach(clearTimeout);
    this.gSteps = all.map((im, i) => setTimeout(() => all.forEach((x) => x.classList.toggle("on", x === im)), 50 + i * sc.frame_seconds * 1000)); // once, held on the last
    const icons = { music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-4"/><circle cx="8" cy="14" r="2.5"/><path d="M14 12h4M14 16h4"/></svg>',
      timers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>' };
    this.root.querySelector(".gicon").innerHTML = icons[g.kind];
    this.root.querySelector(".gtitle").textContent = g.title;
    this.root.querySelector(".gsub").textContent = g.sub;
    this.root.querySelector(".gdock").style.display = g.kind === "info" ? "none" : "";
    box.hidden = false;
    this.guestBody();
    this.guestTouch(sc);
    this.guestDock();
  }
  guestBody() {
    const g = this.guests?.[this.openGuest], body = this.root.querySelector(".gbody");
    if (!g) return;
    if (g.kind === "music") {
      body.innerHTML = `<div class="gpanel"><span class="k">Radio</span><span class="v"></span></div>
        <div class="gbar"><span class="t"></span>
          <button class="another" title="Another station" aria-label="Another station"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
          <button class="main stop" title="Stop the radio" aria-label="Stop the radio"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg></button></div>`;
      body.querySelector(".v").textContent = g.station;
      body.querySelector(".t").textContent = g.station;
      body.querySelector(".stop").addEventListener("click", (ev) => { ev.stopPropagation(); window.NinaApp?.set("radio", false); this.guestEnd("music"); });
      body.querySelector(".another").addEventListener("click", (ev) => { ev.stopPropagation(); this.guestTouch(); this.api("/api/do", { action: "type", arg: "Another station, please." }).catch(() => {}); });
    } else if (g.kind === "timers") {
      body.innerHTML = `<div class="gpanel"><span class="k"></span><span class="v"></span></div>`;
      body.querySelector(".k").textContent = g.alarm ? "rings at " + new Date(g.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "time left";
      this.guestTick();
    } else {
      body.innerHTML = `<div class="gcap"></div>`;
      body.querySelector(".gcap").textContent = g.text;
    }
  }
  left(g) { const s = Math.max(0, Math.round((g.end - Date.now()) / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  guestTick() { // a timer's time left, once a second, only while one runs (the open card's panel, its tab)
    clearInterval(this.gTick);
    const t = this.guests?.timers;
    if (!t || !t.end) return;
    const draw = () => {
      if (Date.now() >= t.end) { clearInterval(this.gTick); this.guestEnd("timers"); return; }
      const v = this.root.querySelector(".gbody .v"); if (this.openGuest === "timers" && v) v.textContent = this.left(t);
      const tab = this.root.querySelector('.tab[data-k="timers"] span'); if (tab) tab.textContent = this.left(t);
    };
    draw(); this.gTick = setInterval(draw, 1000);
  }
  running(key) { if (key === "stage") return !!this.stg; return key === "music" ? (window.NinaApp ? window.NinaApp.get("radio") : true) : key === "timers" ? !!(this.guests?.timers?.end > Date.now()) : false; }
  guestTouch(sc) { // the open card stays 8 s more (running: then docks) or show_seconds (nothing running: then closes)
    sc ||= this.scenes || { show_seconds: 12 };
    const key = this.openGuest; if (!key) return;
    clearTimeout(this.gIdle); clearInterval(this.gCount);
    const run = key !== "info";
    const until = Date.now() + (run ? 8000 : sc.show_seconds * 1000);
    const note = this.root.querySelector(".gnote");
    const tick = () => { const s = Math.ceil((until - Date.now()) / 1000); note.textContent = run ? `to the edge in ${s} s · tap to keep it` : ""; };
    tick(); if (run) this.gCount = setInterval(tick, 1000);
    this.gIdle = setTimeout(() => { clearInterval(this.gCount); run ? this.guestMin() : this.guestEnd(key); }, until - Date.now());
  }
  guestMin() { // docked: the card closed, its process going on, its tab on the edge
    clearTimeout(this.gIdle); clearInterval(this.gCount); (this.gSteps || []).forEach(clearTimeout);
    this.root.querySelector(".guest").hidden = true;
    this.root.querySelector(".gimgs").replaceChildren(); // its images freed
    this.openGuest = null;
    this.guestDock();
  }
  guestEnd(key) { // closed: its process over (the radio stopped, the timer rung)
    if (this.guests) delete this.guests[key];
    if (this.openGuest === key) this.guestMin();
    if (key === "timers") clearInterval(this.gTick);
    this.guestDock();
  }
  guestDock() { // the tabs: the running guests not open, newest on top; still icons, one word
    const dock = this.root.querySelector(".dock");
    const keys = Object.keys(this.guests || {}).filter((k) => k !== this.openGuest && k !== "info" && k !== "stage" && this.running(k))
      .sort((a, b) => this.guests[b].at - this.guests[a].at);
    const icon = { music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-4"/><circle cx="8" cy="14" r="2.5"/><path d="M14 12h4M14 16h4"/></svg>',
      timers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
      stage: this.stageIcon() };
    if (this.stg?.min) keys.unshift("stage"); // the stage docked: its tab, newest on top
    dock.replaceChildren(...keys.map((k) => {
      const b = document.createElement("button"); b.className = "tab"; b.dataset.k = k;
      b.setAttribute("aria-label", ({ music: "The radio", timers: "The timer", stage: this.stg?.what === "videos" ? "The video" : "The photos" })[k] + ": open its card");
      b.innerHTML = icon[k] + `<span>${k === "music" ? "radio" : k === "stage" ? (this.stg?.what === "videos" ? "video" : "photos") : this.left(this.guests[k])}</span>`;
      b.addEventListener("click", () => this.guestOpen(k));
      return b;
    }));
    if (this.guests?.music && !this.running("music")) delete this.guests.music; // stopped elsewhere (her card's ■ radio, a crash)
  }

  // ---- the stage: videos and photos as a guest over her face (the user, 2026-11-28: the Home Assistant
  // cards ported to her own screens). Her screen tool's "stage" events open it (videos: her playlist, a
  // search's videos, a playlist; photos: an album, from her own Google albums through album_photos, or
  // her scenes where there are none). It docks only when asked (the chevron, a swipe right, another card
  // opening): it is watched, not glanced at. Docked, a video plays on and a slideshow holds; × closes it.
  // Her voice and the person speaking duck the video to a quarter, as the radio is ducked.
  stageIcon() {
    return this.stg?.what === "videos"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg>';
  }
  stageEv(e) {
    if (!window.NinaApp && !this.c.guests) return;
    const s = e.show;
    if (s === "close") return this.stageEnd();
    if (({ next: 1, previous: 1, pause: 1, play: 1 })[s]) {
      if (!this.stg) return;
      if (s === "next" || s === "previous") this.stageAct(s === "next" ? "next" : "prev");
      else if ((s === "pause") === !!this.stg.playing) this.stageAct("play");
      return;
    }
    if (s === "videos" || s === "photos") this.stageOpen(s, e);
  }
  stageOpen(what, o) {
    this.stageEnd(true);
    if (this.openGuest) this.guestMin();
    const st = this.stg = { what, playing: true, muted: false, vol: 70, duck: false, min: false, at: Date.now() };
    const q = (x) => this.root.querySelector(x), body = q(".sbody");
    q(".stage .gicon").innerHTML = this.stageIcon();
    q(".stage .gtitle").textContent = o.title || (what === "videos" ? "Videos" : "Photos");
    q(".stage .gsub").textContent = what === "videos" ? (o.videos?.length ? `${o.videos.length} found` : "") : (o.album || "Nina's gallery");
    q(".scount").textContent = "";
    if (what === "videos") {
      const v = this.c.videos || { playlist: "PLSh0S6uPqqgA" }; // her own playlist (the Claudia videos), as on her Home Assistant screen
      const p = new URLSearchParams({ autoplay: 1, mute: 1, loop: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, enablejsapi: 1, origin: location.origin });
      let src;
      if (o.videos?.length) { p.set("playlist", o.videos.join(",")); src = `https://www.youtube-nocookie.com/embed/${o.videos[0]}?${p}`; }
      else if (o.playlist || v.playlist) { p.set("list", o.playlist || v.playlist); src = `https://www.youtube-nocookie.com/embed/videoseries?${p}`; }
      else { p.set("playlist", v.video); src = `https://www.youtube-nocookie.com/embed/${v.video}?${p}`; }
      body.innerHTML = `<iframe allow="autoplay; encrypted-media; fullscreen" referrerpolicy="strict-origin-when-cross-origin" title="Videos"></iframe>`;
      const fr = body.querySelector("iframe");
      st.cmd = (func, args = []) => fr.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
      // YouTube's handshake: "listening" until the player answers; then its volume, and play
      let ready = false;
      st.hello = setInterval(() => fr.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*"), 400);
      st.onMsg = (m) => {
        if (m.source !== fr.contentWindow) return;
        let d; try { d = JSON.parse(m.data); } catch { return; }
        if (!ready) { ready = true; clearInterval(st.hello); this.stageVolume(); st.cmd("playVideo"); }
        const i = d.info || {};
        if (i.playerState !== undefined) { st.playing = i.playerState === 1 || i.playerState === 3; this.stageMark(); }
      };
      addEventListener("message", st.onMsg);
      fr.src = src;
      if (window.NinaApp?.get("radio")) { window.NinaApp.set("radio", false); this.guestEnd("music"); } // the radio stops for the video
    } else {
      body.innerHTML = `<img alt=""><img alt="">`;
      st.album = o.album || "";
      this.api("/api/do", { action: "album_photos", arg: st.album }).then((r) => { if (r?.error) this.stagePics(null, r.error); }).catch(() => this.stagePics(null, "her panel is not reachable"));
    }
    this.stageMark();
    this.stageShow();
  }
  albumEv(e) { // the album's photos (or why not), for the slideshow open now
    const st = this.stg;
    if (!st || st.what !== "photos") return;
    this.stagePics(e.photos?.length ? e.photos : null, e.error || (e.photos ? "the album is empty" : ""), e.album);
  }
  async stagePics(urls, why, album) {
    const st = this.stg; if (!st || st.what !== "photos") return;
    if (!urls) { // no Google album here: her scenes, as her Home Assistant screen had on Pascal
      const sc = this.scenes ||= await fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => null);
      urls = Object.entries(sc?.frames || {}).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${ASSETS}scenes/${k}/${i + 1}.webp`));
      this.root.querySelector(".stage .gsub").textContent = "her scenes"; if (why) console.log("stage photos: her scenes:", why); // no Google album here (no token, no album)
    } else {
      if (album) this.root.querySelector(".stage .gsub").textContent = album;
      clearTimeout(st.refresh); // Google's URLs last an hour: the list again before then, the place kept
      st.refresh = setTimeout(() => this.stg === st && this.api("/api/do", { action: "album_photos", arg: st.album }).catch(() => {}), 50 * 60000);
    }
    if (st.urls) { st.urls = urls; return; } // a refresh: the same show
    for (let i = urls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [urls[i], urls[j]] = [urls[j], urls[i]]; }
    st.urls = urls; st.i = -1;
    this.stageStep(1);
  }
  stageStep(d) { // d photos on, shown now; the next in 10 s while it plays and is not docked
    const st = this.stg; if (!st?.urls?.length) return;
    clearTimeout(st.tm);
    st.i = (st.i + d + st.urls.length) % st.urls.length;
    const [a, b] = this.root.querySelectorAll(".sbody img");
    if (!a) return;
    const show = a.classList.contains("on") ? b : a, hide = show === a ? b : a;
    show.onload = () => { show.classList.add("on"); hide.classList.remove("on"); };
    show.onerror = () => { if (this.stg === st && st.playing && !st.min) st.tm = setTimeout(() => this.stageStep(1), 1000); };
    show.src = st.urls[st.i];
    this.root.querySelector(".scount").textContent = `${st.i + 1} / ${st.urls.length}`;
    if (st.playing && !st.min) st.tm = setTimeout(() => this.stageStep(1), 10000);
  }
  stageAct(f) {
    const st = this.stg; if (!st) return;
    if (st.what === "videos") {
      if (f === "prev") st.cmd?.("previousVideo");
      else if (f === "next") st.cmd?.("nextVideo");
      else if (f === "play") st.cmd?.(st.playing ? "pauseVideo" : "playVideo");
      return;
    }
    if (f === "prev") { st.playing = false; this.stageStep(-1); }
    else if (f === "next") this.stageStep(1);
    else if (f === "play") { st.playing = !st.playing; if (st.playing) this.stageStep(1); else clearTimeout(st.tm); }
    this.stageMark();
  }
  stageMark() {
    const b = this.root.querySelector('.sctl [data-f="play"]'); if (!b) return;
    b.innerHTML = this.stg?.playing
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';
  }
  stageDuck(s) { // a quarter of the video's volume while she speaks, or the person speaks to her
    const st = this.stg; if (!st || st.what !== "videos" || !s) return;
    const d = !!(s.speaking || s.replying || (s.awake && String(s.floor || "").startsWith("USER")));
    if (d !== st.duck) { st.duck = d; this.stageVolume(); }
  }
  stageVolume() {
    const st = this.stg; if (!st?.cmd) return;
    st.cmd("unMute"); st.cmd("setVolume", [Math.round(st.duck ? st.vol / 4 : st.vol)]);
  }
  stageShow() { // open: over her lower half (the right half on its side)
    const st = this.stg; if (!st) return;
    if (this.openGuest) this.guestMin();
    st.min = false;
    this.root.querySelector(".stage").hidden = false;
    if (st.what === "photos" && st.playing && st.urls) this.stageStep(0);
    this.guestDock();
  }
  stageMin() { // docked: its tab on the edge; a video plays on, a slideshow holds
    const st = this.stg; if (!st) return;
    st.min = true; clearTimeout(st.tm);
    this.root.querySelector(".stage").hidden = true;
    this.guestDock();
  }
  stageEnd(quiet) { // closed: the player gone, nothing left running
    const st = this.stg; if (!st) return;
    clearInterval(st.hello); clearTimeout(st.tm); clearTimeout(st.refresh);
    if (st.onMsg) removeEventListener("message", st.onMsg);
    this.stg = null;
    const box = this.root.querySelector(".stage");
    box.hidden = true; box.querySelector(".sbody").replaceChildren();
    if (!quiet) this.guestDock();
  }
  show(name, on) { const f = this.frames?.[name]; if (f) f.classList.toggle("on", on); if (this.target) this.target[name] = on ? 1 : 0; }
  // gl3d: the frames and the depth in one shader; it steps aside if the machine is too slow.
  gl3d() {
    if (!this.depth.naturalWidth || !this.frames.neutral.naturalWidth) return;
    const rig = this.root.querySelector(".rig");
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }"));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 v;
      uniform sampler2D t0, t1, t2, t3, t4, td; uniform float w1, w2, w3, w4, zoom; uniform vec2 off, vis, org;
      void main(){
        vec2 uv = org + ((v - .5) / zoom + .5) * vis;
        float d = texture2D(td, uv).r;
        uv += off * (d - .45);
        vec4 c = texture2D(t0, uv); // each frame differs from the base only at its patch: the differences add
        vec4 o = c + w1 * (texture2D(t1, uv) - c) + w2 * (texture2D(t2, uv) - c)
                   + w3 * (texture2D(t3, uv) - c) + w4 * (texture2D(t4, uv) - c);
        gl_FragColor = clamp(o, 0., 1.); }`));
    gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    const names = ["neutral", "talk-a", "talk-b", "blink", "smile"];
    [...names.map((n) => this.frames[n] || this.frames.neutral), this.depth].forEach((img, i) => {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.uniform1i(gl.getUniformLocation(pr, i < 5 ? "t" + i : "td"), i);
    });
    const U = (n) => gl.getUniformLocation(pr, n);
    const uw = [null, U("w1"), U("w2"), U("w3"), U("w4")], uz = U("zoom"), uo = U("off"), uv = U("vis"), ug = U("org");
    const tau = { "talk-a": 70, "talk-b": 70, blink: 110, smile: 400 }, w = { "talk-a": 0, "talk-b": 0, blink: 0, smile: 0 };
    rig.appendChild(cv); rig.classList.add("gl");
    const ia = this.frames.neutral.naturalWidth / this.frames.neutral.naturalHeight;
    let last = performance.now(), t0 = last, slow = 0, frames = 0, ox = 0, oy = 0;
    const stop = () => { cancelAnimationFrame(this.raf); clearTimeout(this.tm); this.raf = null; };
    const fallback = (why) => { stop(); cv.remove(); rig.classList.remove("gl"); this.gl = null; console.info("nina-card: parallax off:", why); };
    // paced by a timer, one frame asked for each frame drawn (a loop that asks 60 times a second
    // and draws 15 is throttled by the browsers to 1 a second, and wakes them for nothing)
    const next = (every) => { this.tm = setTimeout(() => { this.raf = requestAnimationFrame(draw); }, Math.max(0, every - 8)); };
    const draw = (now) => {
      const cl0 = rig.classList, asleep = cl0.contains("slow"), busy = cl0.contains("fast") || cl0.contains("lean");
      // 30 or 15 frames a second; config fps: [busy, rest] lower for a small device (the Fire 7's Mali-450
      // at 15/30: a third of a core at rest, 2026-11-27)
      const fps = this.c.fps || [30, 15], every = 1000 / (busy ? fps[0] : fps[1]);
      next(every);
      const dt = now - last;
      last = now; frames++;
      if (frames > 5 && now - t0 < 6000) { slow = dt > every + 50 ? slow + dt : Math.max(0, slow - dt); if (slow > 3000) return fallback("too slow (" + Math.round(dt) + " ms a frame)"); }
      if (asleep && Object.keys(w).every((n) => Math.abs((this.target[n] || 0) - w[n]) < .01)) { // settled: rest until she wakes
        if (++this.still > 8) { stop(); return; }
      } else this.still = 0;
      const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (this.c.gl_scale || 1); // gl_scale < 1: fewer pixels, scaled up (a small GPU)
      const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
      if (!cw || !ch) return;
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; gl.viewport(0, 0, cw, ch); }
      const ca = cw / ch; // object-fit: cover, object-position 50% 35%
      const vis = ca > ia ? [1, ia / ca] : [ca / ia, 1];
      gl.uniform2f(uv, vis[0], vis[1]); gl.uniform2f(ug, (1 - vis[0]) * .5, (1 - vis[1]) * .35);
      for (const n in w) w[n] += ((this.target[n] || 0) - w[n]) * Math.min(1, dt / tau[n]);
      names.slice(1).forEach((n, i) => gl.uniform1f(uw[i + 1], this.frames[n] ? w[n] : 0));
      const s = now / 1000, cl = rig.classList, amp = cl.contains("slow") ? .012 : cl.contains("fast") ? .03 : .025;
      const sp = cl.contains("slow") ? .6 : cl.contains("fast") ? 1.4 : 1;
      let tx = amp * Math.sin(s * sp * 2 * Math.PI / 9) + (cl.contains("lean") ? .02 : 0), ty = amp * .5 * Math.sin(s * sp * 2 * Math.PI / 13 + 1);
      const vw = hub.viewer, flip = this.c.viewer_flip ? -1 : 1;
      if (vw && Date.now() - vw.at < 10000 && !cl.contains("slow")) { // someone there: she turns to them, the drift calms
        const k = Math.max(-1, Math.min(1, (vw.angle || 0) / 40)), e = Math.max(-1, Math.min(1, (vw.elevation || 0) / 30));
        tx = -flip * .035 * k + tx * .3; ty = -.02 * e + ty * .3;
      }
      ox += (tx - ox) * Math.min(1, dt / 600); oy += (ty - oy) * Math.min(1, dt / 600);
      gl.uniform2f(uo, ox, oy); gl.uniform1f(uz, 1.05 + .004 * Math.sin(s * 2 * Math.PI / 4.5));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    this.gl = { start: () => { if (!this.raf) { last = performance.now(); this.raf = requestAnimationFrame(draw); } }, stop };
    document.addEventListener("visibilitychange", () => this.gl && (document.hidden ? this.gl.stop() : this.gl.start()));
    // a resize clears a WebGL canvas: draw again, even asleep (her loop rests once settled; a page
    // that settles its size after the first frames, as her remote screen does, showed black)
    new ResizeObserver(() => { this.still = 0; this.gl?.start(); }).observe(cv);
    if (this.isConnected) this.gl.start();
  }
  mouth(name) { for (const m of ["talk-a", "talk-b"]) this.show(m, m === name); }
  // animate runs her face's timers while the card is on the page.
  animate(run) {
    clearTimeout(this.tBlink); clearTimeout(this.tMouth);
    if (!run || !this.frames) return;
    const blink = () => {
      const s = hub.status;
      if (s && (s.awake || s.mind)) {
        this.show("blink", true);
        setTimeout(() => this.show("blink", false), 120);
        if (Math.random() < .15) setTimeout(() => { this.show("blink", true); setTimeout(() => this.show("blink", false), 110); }, 300);
      }
      this.tBlink = setTimeout(blink, 2500 + Math.random() * 3800);
    };
    const mouth = () => {
      if (hub.status?.speaking || Date.now() < hub.talkUntil) { // her voice, or her text reply with the voice off
        const r = Math.random();
        this.mouth(r < .4 ? "talk-a" : r < .75 ? "talk-b" : null);
        this.wasSpeaking = true;
        this.tMouth = setTimeout(mouth, 85 + Math.random() * 95);
        return;
      }
      if (this.wasSpeaking) {
        this.wasSpeaking = false; this.mouth(null);
        if (Math.random() < .55) { this.show("smile", true); setTimeout(() => this.show("smile", false), 1400 + Math.random() * 1200); }
      }
      this.tMouth = setTimeout(mouth, 120);
    };
    this.tBlink = setTimeout(blink, 1500); this.tMouth = setTimeout(mouth, 120);
  }
  render() {
    if (!this.root) return;
    if (this.persona && !this.pinned && hub.persona && hub.persona !== this.persona && this.names?.includes(hub.persona)) this.swap(hub.persona);
    this.showPrefs();
    const fl = this.root.querySelector(".flag"), su = hub.surprises; // ⚑ N: surprises she has not told about
    fl.hidden = !hub.status || !su || (!su.unseen && !su.open);
    if (su) {
      fl.textContent = su.unseen ? `⚑ ${su.unseen}` : "⚑";
      fl.classList.toggle("quiet", !su.unseen);
      fl.title = `${su.unseen} new surprise${su.unseen === 1 ? "" : "s"}, ${su.open} open in the domains' records: tap to hear them`;
    }
    this.root.querySelectorAll("button[data-p]").forEach((b) => { // the mic and her voice are hers: off without her
      b.disabled = !hub.status;
      b.title = hub.status ? "" : "Nina is not running: nothing to switch";
    });
    if (hub.status) this.status(hub.status);
    else { // no Nina (her panel not reachable): her face rests, eyes closed, nothing drawn
      this.state("Nina is not running here");
      if (this.frames) { // …unless someone is at the screen (the radar): then she looks up
        const attend = !!hub.presence?.inReach, rig = this.root.querySelector(".rig");
        this.show("blink", !attend); rig.classList.toggle("slow", !attend); rig.classList.toggle("lean", attend); rig.classList.remove("fast");
        if (attend && this.isConnected && !document.hidden) this.gl?.start();
      }
    }
    { const pk = this.root.querySelector(".pick"), p = hub.pick;
      pk.hidden = !(p && p.png);
      if (p && p.png) {
        if (pk.querySelector("img").src !== p.png) pk.querySelector("img").src = p.png;
        pk.querySelector(".pickn").textContent = p.copying ? "Copying the photos into her album…" :
          `Scan with your phone: pick photos in Google Photos for ${p.album ? "“" + p.album + "”" : "her album"}.`;
      }
      if (hub.pickNote && Date.now() - hub.pickNote.at < 8000) this.state(hub.pickNote.text); }
    const max = this.c.message_max_age * 1000;
    const msgs = hub.msgs.filter((m) => !max || Date.now() - m.t <= max).slice(-this.c.max_messages);
    const chat = this.root.querySelector(".chat");
    const bubble = (m) => {
      const b = document.createElement("div");
      b.className = "b " + m.cls + (m.live ? " live" : "");
      if (!m.parts) { b.textContent = m.text; return b; }
      m.parts.filter((p) => p.text).forEach((p, i) => { // the utterances as the endpointer split them
        if (i) { const c = document.createElement("span"); c.className = "cut"; c.title = "a pause: the utterance split here"; b.appendChild(c); }
        const sp = document.createElement("span"); sp.className = "seg" + (p.final ? "" : " live"); sp.textContent = p.text; b.appendChild(sp);
      });
      return b;
    };
    const nodes = msgs.filter((m) => !m.parts || m.parts.some((p) => p.text)).map(bubble);
    // the dots: not in her app (its state line says it, and their animation kept her screen repainting)
    if (hub.listening != null && hub.status?.awake !== false && !window.NinaApp) { const d = document.createElement("div"); d.className = "b listening"; d.title = "listening"; nodes.push(d); }
    chat.replaceChildren(...nodes);
    chat.scrollTop = chat.scrollHeight;
  }
  set hass(h) {
    this._hass = h;
    const ve = h?.states?.[this.c.viewer || "sensor.nina_viewer"];
    if (ve) { // presence: someone in reach of the screen and she attends (eyes open, leaning in), asleep or not
      const pr = { present: ve.state === "present", near: !!ve.attributes?.near, inReach: ve.state === "present" && !!ve.attributes?.in_reach };
      if (!hub.presence || pr.inReach !== hub.presence.inReach || pr.near !== hub.presence.near || pr.present !== hub.presence.present) { hub.presence = pr; hub.emit(); }
    }
    // the radar (fsttm-live cmd/radar): state present | absent, attributes distance (m) and, from a radar
    // that has one (an LD2450; the LD2410C has none), angle in degrees
    if (ve && ve.state === "present" && isFinite(+ve.attributes?.angle)) {
      const at = Date.parse(ve.last_updated);
      if (!hub.viewer || at > hub.viewer.at) hub.viewer = { angle: +ve.attributes.angle, distance: +ve.attributes?.distance || null, elevation: +ve.attributes?.elevation || 0, at };
    }
    const p = h?.states?.["sensor.nina_persona"]?.state;
    if (this.persona && !this.pinned && p && p !== this.persona && this.names?.includes(p)) this.swap(p);
  }
  // swap: her mood changed: the face fades out, the new persona's frames in.
  swap(name) {
    if (this.swapping) return;
    this.swapping = true;
    const f = this.root.querySelector(".face"), rig = this.root.querySelector(".rig");
    f.style.transition = "opacity .9s ease"; f.style.opacity = "0";
    setTimeout(() => {
      this.gl?.stop(); this.gl = null;
      rig.querySelector("canvas")?.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
      rig.replaceChildren(); rig.classList.remove("gl");
      this.face(name); this.render();
      const back = () => { f.style.opacity = "1"; this.swapping = false; };
      this.frames.neutral.complete ? back() : this.frames.neutral.addEventListener("load", back, { once: true });
      setTimeout(back, 3000);
    }, 900);
  }
  getCardSize() { return 5; }
  async api(path, body) {
    const r = await fetch(this.panel + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const t = await r.text(); // an error comes as {error}; a plain-text one is kept as one
    try { return JSON.parse(t); } catch { return { error: t || r.statusText }; }
  }
  async toggle(p) {
    if (window.NinaApp) { // her app (fsttm-live's Android app): its mic and its speaker, switched by the app
      window.NinaApp.set(p, !window.NinaApp.get(p));
      setTimeout(() => hub.emit(), 50); // the app applies it on its own thread
      return;
    }
    if (this.c.remote) { // this device's microphone and speaker, not the room's
      try { await remote.toggle(this.panel, p); } catch (e) { this.state(p === "mic" ? "no microphone here: " + (e.message || e) : String(e)); }
      hub.emit();
      return;
    }
    const on = !hub.prefs?.[p];
    try { await this.api("/api/prefs", { [p]: on }); hub.prefs = Object.assign(hub.prefs || {}, { [p]: on }); hub.emit(); } catch (e) { this.state("her panel is not reachable"); }
  }
  showPrefs() {
    // (her app's radio: its guest card's tab on the edge, not a button in the bar: the user, 2026-11-28)
    this.root.querySelectorAll("button[data-p]").forEach((b) => b.classList.toggle("on",
      window.NinaApp ? window.NinaApp.get(b.dataset.p) : this.c.remote ? !!remote[b.dataset.p] : !!hub.prefs?.[b.dataset.p]));
  }
  state(t) { this.root.querySelector(".state").textContent = t; }
  status(s) {
    const orb = this.root.querySelector(".orb");
    orb.className = "orb" + (s.awake ? "" : " asleep") + (s.hearing ? " hearing" : "") + (s.speaking ? " speaking" : "");
    if (this.frames) {
      const asleep = !s.mind && !s.awake, attend = !!hub.presence?.inReach; // someone at the screen: she looks up
      if ((!asleep || attend) && this.isConnected && !document.hidden) this.gl?.start(); // drawing rests while she sleeps alone
      this.show("blink", asleep && !attend);
      const rig = this.root.querySelector(".rig");
      rig.classList.toggle("slow", asleep && !attend);
      rig.classList.toggle("fast", !!s.speaking);
      rig.classList.toggle("lean", (!!s.hearing || attend) && !s.speaking);
    }
    this.state(!s.mind && !s.awake ? "asleep" : s.speaking ? "speaking" : s.replying ? "thinking" : s.hearing ? "listening" : s.awake ? "here" : "asleep");
  }
}
customElements.define("nina-card", NinaCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "nina-card", name: "Nina", description: "Nina: her state, the mic and her voice, the conversation." });
