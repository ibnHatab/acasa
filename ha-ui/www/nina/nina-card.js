// Nina's card (acasa ha-ui, 2026-11-24): Nina herself on the dashboard. Her state from her panel
// (fsttm-live's web plugin, :8770): awake or asleep, listening, thinking, speaking, the floor; the
// mic and her voice, on and off (POST /api/prefs); the conversation as it happens (the event
// stream), as chat bubbles. The bubbles take assist-chat-display's theme variables, so one theme
// styles both. Config: panel (default: this host, port 8770), max_messages (20), message_max_age
// (s, 300; 0 keeps them), height (a CSS height: the card's, e.g. calc(100vh - 32px) on the panel),
// face (the folder of one persona's frames, or "" for none), personas (the folders' names under
// /local/nina/personas: one is the day's, by the date, until Nina draws it herself; ?persona=NAME
// in the address picks one).
//
// Her face (2026-11-24, the user: a talking head, cheap; Claudia's look): five frames drawn as edits
// of one portrait and composited so they differ only at the mouth and the eyes (nina-live
// design/tools/sprites.py). The base never leaves; a mouth or blink frame fades in over it and out
// again, so the crossfades melt instead of ghosting. While she speaks her mouth cycles at random
// (no lip sync), she blinks every few seconds, sways and breathes (a CSS transform); asleep, her
// eyes stay closed; after a reply she may smile. Nothing is computed but a timer and an opacity.
// One hub per page load: one connection to her panel, one conversation, shared by every Nina card
// (each page of the dashboard has its own card: the conversation goes on as the page changes).
const hub = window.__ninaHub || (window.__ninaHub = {
  msgs: [], status: null, prefs: null, cards: new Set(), started: false, said: "", nina: null, panel: null,
  emit() { this.cards.forEach((c) => c.render()); },
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
    const connect = () => {
      fetch(panel + "/api/state").then((r) => r.json()).then((s) => { this.prefs = s.prefs; this.status = s.status; this.emit(); })
        .catch(() => { this.status = null; this.emit(); });
      const es = new EventSource(panel + "/api/events");
      es.addEventListener("status", (m) => { this.status = JSON.parse(m.data); this.emit(); });
      es.addEventListener("ev", (m) => {
        const e = JSON.parse(m.data);
        switch (e.ev) {
          case "typed": this.add("user", e.text); break;
          case "turn":
            if (e.note) this.add("note", e.text.replace(/^NOTE \((\w+)\): /, ""));
            else if (!e.typed_shown) this.add("user", e.text.replace(/^\(You were interrupted[^)]*\)\n/, ""));
            this.nina = null; this.said = ""; break;
          case "said":
            this.said += e.text;
            if (!this.nina) this.nina = this.add("nina", this.said); else { this.nina.text = this.said.trim(); this.emit(); }
            break;
          case "reply_done":
            if (!this.nina && e.said) this.add("nina", e.said); else if (this.nina) { this.nina.text = (e.said || this.said).trim(); this.emit(); }
            this.nina = null; this.said = ""; break;
          case "prefs": this.prefs = e.prefs; this.emit(); break;
        }
      });
      es.onerror = () => { es.close(); this.status = null; this.emit(); setTimeout(connect, 5000); };
    };
    connect();
  },
});

class NinaCard extends HTMLElement {
  setConfig(c) {
    this.c = Object.assign({ max_messages: 20, message_max_age: 300 }, c || {});
    this.panel = this.c.panel || `${location.protocol}//${location.hostname}:8770`;
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
  .face:not([hidden]) ~ .chat .user { background: color-mix(in srgb, var(--assist-chat-display-user-bubble-background, #3b6ea5) 62%, transparent); }
  .face:not([hidden]) ~ .chat .nina { background: color-mix(in srgb, var(--assist-chat-display-assistant-bubble-background, var(--primary-color)) 66%, transparent); }
  .face:not([hidden]) ~ .chat .note { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  .face:not([hidden]) ~ .hint { margin: auto 0 18px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  .top { display: flex; align-items: center; gap: 12px; }
  .orb { width: 42px; height: 42px; border-radius: 50%; flex: none;
         background: radial-gradient(circle at 35% 35%, var(--nina-orb-light, #ffd9a8), var(--nina-orb, #c96f2e));
         box-shadow: 0 0 0 0 var(--nina-orb, #c96f2e); transition: filter .4s, box-shadow .4s; }
  .orb.asleep { filter: grayscale(.8) brightness(.55); }
  .orb.hearing { box-shadow: 0 0 0 6px color-mix(in srgb, var(--nina-orb, #c96f2e) 35%, transparent); }
  .orb.speaking { animation: breathe 1.2s ease-in-out infinite; }
  @keyframes breathe { 50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--nina-orb, #c96f2e) 25%, transparent); } }
  .who { flex: 1; }
  .name { font-size: 1.25em; font-weight: 500; color: var(--primary-text-color); }
  .state { color: var(--secondary-text-color); font-size: .9em; }
  .toggles { display: flex; gap: 8px; }
  button { border: 0; border-radius: 999px; padding: 8px 14px; font: inherit; cursor: pointer;
           background: var(--secondary-background-color); color: var(--secondary-text-color); }
  button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--assist-chat-display-gap, 8px);
          font-size: var(--assist-chat-display-font-size, 16px); min-height: 80px; }
  .b { max-width: 82%; padding: var(--assist-chat-display-padding, 8px) 12px; border-radius: var(--assist-chat-display-radius, 20px);
       line-height: 1.35; white-space: pre-wrap; }
  .user { align-self: flex-end; background: var(--assist-chat-display-user-bubble-background, var(--blue-color, #3b6ea5));
          color: var(--assist-chat-display-user-bubble-color, #fff); }
  .nina { align-self: flex-start; background: var(--assist-chat-display-assistant-bubble-background, var(--primary-color));
          color: var(--assist-chat-display-assistant-bubble-color, #fff); }
  .note { align-self: center; background: transparent; color: var(--secondary-text-color); font-style: italic; font-size: .9em; }
  .off { color: var(--secondary-text-color); font-size: .85em; text-align: center; }
  .hint { margin: auto; color: var(--secondary-text-color); text-align: center; line-height: 1.6; opacity: .8; }
  .chat:not(:empty) + .hint { display: none; }
</style>
<ha-card>
  <div class="face" hidden><div class="rig"></div></div>
  <div class="top"><div class="orb asleep"></div>
    <div class="who"><div class="name">Nina</div><div class="state">…</div></div>
    <div class="toggles"><button data-p="mic">mic</button><button data-p="voice">voice</button></div></div>
  <div class="chat"></div>
  <div class="hint">Say “Nina”, or tap the mic.</div>
  <div class="credit" hidden>Claudia by anabology · AI-generated</div>
</ha-card>`;
      this.face();
      if (this.c.height) this.root.querySelector("ha-card").style.height = this.c.height;
      this.root.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => this.toggle(b.dataset.p)));
      hub.start(this.panel);
      setInterval(() => this.render(), 5000);
    }
  }
  connectedCallback() { hub.cards.add(this); if (this.root) this.render(); this.animate(true); }
  disconnectedCallback() { hub.cards.delete(this); this.animate(false); }
  // face builds the frames' stack (the base, then the overlays).
  face() {
    let dir = this.c.face;
    if (dir === undefined) {
      const names = this.c.personas || ["graphite", "contact", "inkblue", "booth", "snapshot", "sketch", "tinted", "porcelain"];
      const asked = new URLSearchParams(location.search).get("persona");
      const d = new Date(), day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      dir = `/local/nina/personas/${names.includes(asked) ? asked : names[(day * 7 + d.getFullYear()) % names.length]}`;
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
    this.frames.neutral.onload = () => { this.root.querySelector(".face").hidden = false; this.root.querySelector(".credit").hidden = false; };
  }
  show(name, on) { const f = this.frames?.[name]; if (f) f.classList.toggle("on", on); }
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
      if (hub.status?.speaking) {
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
    this.showPrefs();
    if (hub.status) this.status(hub.status); else this.state("her panel is not reachable");
    const max = this.c.message_max_age * 1000;
    const msgs = hub.msgs.filter((m) => !max || Date.now() - m.t <= max).slice(-this.c.max_messages);
    const chat = this.root.querySelector(".chat");
    chat.replaceChildren(...msgs.map((m) => { const b = document.createElement("div"); b.className = "b " + m.cls; b.textContent = m.text; return b; }));
    chat.scrollTop = chat.scrollHeight;
  }
  set hass(h) { this._hass = h; }
  getCardSize() { return 5; }
  async api(path, body) {
    const r = await fetch(this.panel + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    return r.json();
  }
  async toggle(p) {
    const on = !hub.prefs?.[p];
    try { await this.api("/api/prefs", { [p]: on }); hub.prefs = Object.assign(hub.prefs || {}, { [p]: on }); hub.emit(); } catch (e) { this.state("her panel is not reachable"); }
  }
  showPrefs() {
    this.root.querySelectorAll("button").forEach((b) => b.classList.toggle("on", !!hub.prefs?.[b.dataset.p]));
  }
  state(t) { this.root.querySelector(".state").textContent = t; }
  status(s) {
    const orb = this.root.querySelector(".orb");
    orb.className = "orb" + (s.awake ? "" : " asleep") + (s.hearing ? " hearing" : "") + (s.speaking ? " speaking" : "");
    if (this.frames) {
      const asleep = !s.mind && !s.awake;
      this.show("blink", asleep);
      const rig = this.root.querySelector(".rig");
      rig.classList.toggle("slow", asleep);
      rig.classList.toggle("fast", !!s.speaking);
      rig.classList.toggle("lean", !!s.hearing && !s.speaking);
    }
    this.state(!s.mind && !s.awake ? "asleep" : s.speaking ? "speaking" : s.replying ? "thinking" : s.hearing ? "listening" : s.awake ? "here" : "asleep");
  }
}
customElements.define("nina-card", NinaCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "nina-card", name: "Nina", description: "Nina: her state, the mic and her voice, the conversation." });
