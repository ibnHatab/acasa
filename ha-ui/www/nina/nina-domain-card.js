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
const ASSETS = new URL(".", import.meta.url).pathname;
const SCENES = fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => ({ frames: {}, tools: {}, events: {} }));

// one connection to Nina's panel for every domain card on the page
const bus = window.__ninaDomainBus || (window.__ninaDomainBus = {
  cards: new Set(), started: false, panel: `${location.protocol}//${location.hostname}:8770`,
  start() {
    if (this.started) return;
    this.started = true;
    const connect = () => {
      const es = new EventSource(`${this.panel}/api/events`);
      es.addEventListener("ev", (m) => {
        const e = JSON.parse(m.data);
        if (e.ev === "tool") this.cards.forEach((c) => c.cue(e));
      });
      es.onerror = () => { es.close(); setTimeout(connect, 5000); };
    };
    connect();
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
  :host { display: block; }
  ha-card { position: relative; overflow: hidden; padding: 12px 14px; box-sizing: border-box; min-height: 64px;
            background: var(--ha-card-background, var(--card-background-color)); }
  .bg { position: absolute; inset: 0; pointer-events: none; }
  .bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%;
            opacity: 0; transition: opacity 1.2s ease, transform 6s ease; transform: scale(1.04); }
  .bg img.on { opacity: .22; }
  ha-card.bloom .bg img.on { opacity: 1; transform: scale(1.0); }
  .bg::after { content: ""; position: absolute; inset: 0; transition: opacity 1.2s ease;
               background: linear-gradient(to right, rgba(20,16,14,.92) 0, rgba(20,16,14,.55) 55%, rgba(20,16,14,.25) 100%); }
  ha-card.bloom .bg::after { background: linear-gradient(to top, rgba(20,16,14,.85) 0, rgba(20,16,14,.05) 55%); }
  .head { position: relative; display: flex; align-items: center; gap: 10px; }
  .icon { position: relative; width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center;
          background: rgba(255,255,255,.08); color: var(--primary-text-color); transition: background .6s, transform .6s; }
  .icon.mark { background: #d97757; color: #fff; }
  ha-card.bloom .icon { transform: scale(1.15); }
  .icon .badge { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 600;
                 padding: 1px 6px; border-radius: 999px; background: #d97757; color: #fff; white-space: nowrap; }
  .icon .badge:empty { display: none; }
  .title { font-weight: 500; color: var(--primary-text-color); }
  .sub { font-size: .85em; color: var(--secondary-text-color); }
  .caption { position: relative; margin-top: 8px; color: #fff; font-size: 1.05em; line-height: 1.35; text-shadow: 0 1px 4px rgba(0,0,0,.7);
             max-height: 0; opacity: 0; overflow: hidden; transition: max-height .8s ease, opacity .8s ease; }
  ha-card.bloom .caption { max-height: 120px; opacity: 1; }
  .inner { position: relative; margin-top: 8px; }
  .inner:empty { display: none; margin: 0; }
  .swatches { position: relative; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .swatches:empty { display: none; }
  .sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255,255,255,.25); cursor: pointer; padding: 0; }
  .sw:active { transform: scale(.92); }
  /* a tall card (a page of its own): the scene shows in the space below the controls */
  ha-card.tall .bg img.on { opacity: .55; }
  ha-card.tall .bg::after { background: linear-gradient(to bottom, rgba(20,16,14,.95) 0, rgba(20,16,14,.8) 35%, rgba(20,16,14,.15) 100%); }
  ha-card.tall.bloom .bg img.on { opacity: 1; }
  ha-card.compact { padding: 4px 6px; }
  ha-card.compact .head { position: absolute; top: 6px; right: 8px; z-index: 2; }
  ha-card.compact .head .title, ha-card.compact .head .sub { display: none; }
  ha-card.compact .icon { width: 26px; height: 26px; --mdc-icon-size: 16px; }
  ha-card.compact .inner { margin-top: 0; margin-right: 30px; } /* room for the corner icon */
  ha-card.compact .caption { position: absolute; left: 10px; right: 40px; bottom: 8px; margin: 0; z-index: 2; } /* over the scene: no jump */
  /* the inner card sits on the scene: its own background goes */
  .inner > * { --ha-card-background: transparent; --card-background-color: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; }
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
        if (i === this.c.frame) im.classList.add("on");
        bg.appendChild(im);
      }
      this.tools = this.c.tools || Object.entries(sc.tools).filter(([, s]) => s === this.c.scene).map(([t]) => t);
    });
    if (this.c.card) this.inner(this.c.card);
    bus.start();
  }
  async inner(conf) {
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) return;
    this.child = helpers.createCardElement(conf);
    if (this._hass) this.child.hass = this._hass;
    this.root.querySelector(".inner").appendChild(this.child);
  }
  set hass(h) { this._hass = h; if (this.child) this.child.hass = h; }
  connectedCallback() { bus.cards.add(this); }
  disconnectedCallback() { bus.cards.delete(this); }
  getCardSize() { return 2; }
  say(text) {
    fetch(`${bus.panel}/api/do`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "type", arg: text }) }).catch(() => {});
  }
  // cue: one of her tools: bloom (the scene up, its frames turning, her words), then collapse into the icon
  cue(e) {
    if (!this.tools?.includes(e.name)) return;
    const card = this.root.querySelector("ha-card"), imgs = [...this.root.querySelectorAll(".bg img")];
    const text = e.result?.text || "";
    this.root.querySelector(".caption").textContent = text;
    clearTimeout(this.tEnd); (this.tSteps || []).forEach(clearTimeout);
    card.classList.add("bloom");
    const step = (this.scene?.frame_seconds || 2.5) * 1000;
    this.tSteps = imgs.map((im, i) => setTimeout(() => imgs.forEach((x) => x.classList.toggle("on", x === im)), i * step));
    this.tEnd = setTimeout(() => {
      card.classList.remove("bloom");
      imgs.forEach((x, i) => x.classList.toggle("on", i + 1 === this.c.frame));
      this.mark(e, text);
    }, Math.max(this.c.show_seconds * 1000, imgs.length * step + 1500));
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
