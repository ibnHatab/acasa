// Nina's domain card (acasa ha-ui, 2026-11-25; the user's design 2: the Codex scenes as the
// backgrounds of Home Assistant cards, not over Nina's face, whose one face stays hers). Any card
// (config: card) framed in Nina's look: the domain's scene faint behind it, its icon and title.
// When Nina uses the domain (her panel's tool events: tools), the card blooms: the scene comes up,
// its frames turn, her words as the caption; then it collapses back into the icon, which keeps a mark
// (a timer: its countdown until it rings).
//
//   type: custom:nina-domain-card
//   scene: timers            # www/nina/scenes/<scene>/<n>.webp (scenes.json: frames, tools)
//   title: Timers
//   icon: mdi:timer-sand
//   card: {…}                # optional: the Home Assistant card inside
//   swatches: [{name: warm, color: "#f6c27a", say: "make the bedroom light warm white"}]  # optional
//   countdown: true          # a timer's minutes (the tool's args) counted down on the icon
//   height: 180px            # optional
//   compact: true            # no header row: the icon small in the corner (a crowded page)
//   focus: "15% 20%"         # the crop's centre (object-position): a small card shows the scene's object
//   entities: [light.bedroom_led]  # their changes bloom it too (the domain used from Home Assistant, not by Nina)
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
const SCENES = fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => ({ frames: {}, tools: {}, events: {} }));

// one connection to Nina's panel for every domain card on the page
const bus = window.__ninaDomainBus || (window.__ninaDomainBus = {
  cards: new Set(), started: false, panel: (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`),
  start() {
    if (this.started) return;
    this.started = true;
    ninaStream(this.panel).addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      if (e.ev === "tool") this.cards.forEach((c) => c.cue(e));
    });
  },
});

class NinaDomainCard extends HTMLElement {
  setConfig(c) {
    if (!c.scene) throw new Error("nina-domain-card: a scene is needed");
    this.c = Object.assign({ frame: 1, show_seconds: 10 }, c);
    if (this.root) return;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `
<style>
  /* Nina's card scheme (2026-11-25, the user: the scene is each card's background, the widgets on it
     transparent; no semi-transparent panels splitting the picture) */
  :host { display: block; }
  ha-card { position: relative; overflow: hidden; padding: 12px 14px; box-sizing: border-box; min-height: 64px;
            background: #14100e; color: #fff; border: 0;
            --primary-text-color: #fff; --secondary-text-color: rgba(255,255,255,.78); --state-icon-color: #fff;
            --ha-card-background: transparent; --card-background-color: transparent; --ha-card-box-shadow: none;
            --ha-card-border-width: 0; --divider-color: rgba(255,255,255,.12);
            --bubble-main-background-color: transparent; --bubble-button-main-background-color: transparent;
            --bubble-media-player-main-background-color: transparent; --bubble-secondary-background-color: transparent;
            --bubble-main-buttons-background-color: transparent; --bubble-button-background-color: transparent;
            --bubble-icon-background-color: rgba(0,0,0,.35); --bubble-media-player-button-background-color: rgba(0,0,0,.35);
            --bubble-sub-button-background-color: rgba(0,0,0,.35); --bubble-select-main-background-color: transparent; }
  ha-card * { text-shadow: 0 1px 3px rgba(0,0,0,.65); }
  .bg { position: absolute; inset: 0; pointer-events: none; }
  .bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%;
            opacity: 0; transform: scale(1.06); transition: opacity 1.6s ease, transform 9s ease-out; }
  .bg img.on { opacity: 1; transform: scale(1.0); }
  /* legible edges only: the picture stays whole in the middle */
  .bg::after { content: ""; position: absolute; inset: 0;
               background: linear-gradient(to bottom, rgba(10,8,7,.72) 0, rgba(10,8,7,.18) 28%, rgba(10,8,7,.12) 60%, rgba(10,8,7,.7) 100%); }
  .head { position: relative; display: flex; align-items: center; gap: 10px; }
  ha-card.expandable .icon, ha-card.expandable .title { cursor: pointer; }
  ha-card.expandable .icon:hover { background: #d97757; }
  .icon { position: relative; width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center;
          background: rgba(0,0,0,.38); color: #fff; transition: background .6s, transform .6s; }
  .icon.mark { background: #d97757; }
  ha-card.bloom .icon { transform: scale(1.15); }
  .icon .badge { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 600;
                 padding: 1px 6px; border-radius: 999px; background: #d97757; color: #fff; white-space: nowrap; text-shadow: none; }
  .icon .badge:empty { display: none; }
  .title { font-weight: 600; letter-spacing: .01em; }
  .sub { font-size: .85em; color: rgba(255,255,255,.8); }
  .caption { position: relative; margin-top: 8px; font-size: 1.05em; line-height: 1.35;
             max-height: 0; opacity: 0; overflow: hidden; transition: max-height .8s ease, opacity .8s ease; }
  ha-card.bloom .caption { max-height: 120px; opacity: 1; }
  .inner { position: relative; margin-top: 8px; }
  .inner:empty { display: none; margin: 0; }
  .swatches { position: relative; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .swatches:empty { display: none; }
  .sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255,255,255,.6); cursor: pointer; padding: 0;
        box-shadow: 0 1px 6px rgba(0,0,0,.5); }
  .sw:active { transform: scale(.92); }
  ha-card.compact { padding: 4px 6px; }
  ha-card.compact .head { position: absolute; top: 6px; right: 8px; z-index: 2; }
  ha-card.compact .head .title, ha-card.compact .head .sub { display: none; }
  ha-card.compact .icon { width: 26px; height: 26px; --mdc-icon-size: 16px; }
  ha-card.compact .inner { margin-top: 0; margin-right: 30px; }
  ha-card.compact .caption { position: absolute; left: 10px; right: 40px; bottom: 8px; margin: 0; z-index: 2; }
</style>
<ha-card>
  <div class="bg"></div>
  <div class="head"><div class="icon"><ha-icon></ha-icon><span class="badge"></span></div>
    <div><div class="title"></div><div class="sub"></div></div></div>
  <div class="caption"></div>
  <div class="swatches"></div>
  <div class="inner"></div>
</ha-card>`;
    const card = this.root.querySelector("ha-card");
    if (this.c.height) card.style.minHeight = this.c.height;
    if (this.c.compact) card.classList.add("compact");
    if (parseInt(this.c.height) >= 400) card.classList.add("tall");
    this.root.querySelector("ha-icon").setAttribute("icon", this.c.icon || "mdi:home");
    if (!this.c.expanded) { // a single click on its icon or title: the card large (expand: a fuller card for it)
      for (const s of [".icon", ".title"]) this.root.querySelector(s).addEventListener("click", (e) => { e.stopPropagation(); this.open(); });
      card.classList.add("expandable");
    }
    this.root.querySelector(".title").textContent = this.c.title || "";
    this.root.querySelector(".sub").textContent = this.c.subtitle || "";
    for (const s of this.c.swatches || []) {
      const b = document.createElement("button");
      b.className = "sw"; b.title = s.name; b.style.background = s.color;
      b.addEventListener("click", () => this.say(s.say || `make the bedroom light ${s.name}`));
      this.root.querySelector(".swatches").appendChild(b);
    }
    SCENES.then((sc) => {
      this.scene = sc;
      const n = sc.frames[this.c.scene] || 1;
      const bg = this.root.querySelector(".bg");
      for (let i = 1; i <= n; i++) {
        const im = document.createElement("img");
        im.src = `${ASSETS}scenes/${this.c.scene}/${i}.webp`; im.alt = ""; im.loading = "lazy";
        if (this.c.focus) im.style.objectPosition = this.c.focus; // the crop's centre: on a small card, the scene's object, not her face
        bg.appendChild(im);
      }
      this.play(); // as in the review: the first frame, a pause, the next
      this.tools = this.c.tools || Object.entries(sc.tools).filter(([, s]) => s === this.c.scene).map(([t]) => t);
    });
    if (this.c.card) this.inner(this.c.card);
    bus.start();
  }
  async open() {
    const { expand, card } = await EXPAND;
    const conf = { ...this.c, compact: false, expanded: true, focus: undefined, height: "min(78vh, 560px)", card: this.c.expand || this.c.card };
    delete conf.expand;
    expand(card("nina-domain-card", conf));
  }
  async inner(conf) {
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) return;
    this.child = helpers.createCardElement(conf);
    if (this._hass) this.child.hass = this._hass;
    this.root.querySelector(".inner").appendChild(this.child);
  }
  set hass(h) {
    this._hass = h;
    if (this.child) this.child.hass = h;
    for (const id of this.c.entities || []) { // a watched entity changed: the card blooms with its new state
      const st = h.states[id];
      if (!st) continue;
      this.seen ||= {};
      const key = st.state + JSON.stringify(st.attributes?.hs_color || st.attributes?.color_temp_kelvin || st.attributes?.brightness || "");
      if (this.seen[id] !== undefined && this.seen[id] !== key) {
        const name = st.attributes?.friendly_name || id;
        this.cue({ name: "@entity", result: { text: `${name}: ${st.state === "on" ? "on" : st.state}` } }, true);
      }
      this.seen[id] = key;
    }
  }
  connectedCallback() { bus.cards.add(this); }
  disconnectedCallback() { bus.cards.delete(this); }
  getCardSize() { return 2; }
  say(text) {
    fetch(`${bus.panel}/api/do`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "type", arg: text }) }).catch(() => {});
  }
  // play: the scene's frames in turn (the first, a pause, the next…), held on the last
  play() {
    const imgs = [...this.root.querySelectorAll(".bg img")];
    (this.tSteps || []).forEach(clearTimeout);
    const step = (this.c.frame_seconds || 4) * 1000;
    imgs.forEach((x, i) => x.classList.toggle("on", i === 0));
    this.tSteps = imgs.slice(1).map((im, i) => setTimeout(() => imgs.forEach((x) => x.classList.toggle("on", x === im)), (i + 1) * step));
  }
  // cue: one of her tools: bloom (the scene replayed, her words), then collapse into the icon
  cue(e, entity) {
    if (!entity && !this.tools?.includes(e.name)) return;
    const card = this.root.querySelector("ha-card");
    const text = e.result?.text || "";
    this.root.querySelector(".caption").textContent = text;
    clearTimeout(this.tEnd);
    card.classList.add("bloom");
    this.play();
    const n = this.root.querySelectorAll(".bg img").length;
    this.tEnd = setTimeout(() => { card.classList.remove("bloom"); this.mark(e, text); },
      Math.max(this.c.show_seconds * 1000, n * (this.c.frame_seconds || 4) * 1000 + 1500));
  }
  // mark: what the collapse leaves on the icon; a timer counts down to its end
  mark(e, text) {
    const icon = this.root.querySelector(".icon"), badge = this.root.querySelector(".badge");
    clearInterval(this.tCount); clearTimeout(this.tMark);
    this.root.querySelector(".sub").textContent = text.length > 60 ? text.slice(0, 57) + "…" : text;
    const mins = +e.args?.minutes || 0;
    if (this.c.countdown && mins > 0 && (e.args?.intent || "SET") === "SET") {
      const end = Date.now() + mins * 60000;
      icon.classList.add("mark");
      const tick = () => {
        const s = Math.max(0, Math.round((end - Date.now()) / 1000));
        badge.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        if (!s) { clearInterval(this.tCount); badge.textContent = ""; icon.classList.remove("mark"); }
      };
      tick(); this.tCount = setInterval(tick, 1000);
      return;
    }
    icon.classList.add("mark");
    this.tMark = setTimeout(() => icon.classList.remove("mark"), 10 * 60 * 1000); // a recent act: marked ten minutes
  }
}
customElements.define("nina-domain-card", NinaDomainCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "nina-domain-card", name: "Nina's domain", description: "A card in Nina's look: its scene behind it, blooming when she uses the domain." });
