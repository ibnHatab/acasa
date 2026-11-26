// Nina's cards for Home Assistant (acasa ha-ui, 2026-11-25; the user: a Nina card in Home Assistant's
// full mode, her settings and her activities, and a card of their own for the surprises, in either
// mode). All talk to her panel (:8770; CORS for Home Assistant's origin) and wear her card scheme:
// a Codex scene as the background, the controls on it.
//
//   type: custom:nina-settings-card     her name, persona (automatic or pinned), voice, the temperament's tuning
//   type: custom:nina-activity-card     what she did lately: her tools, her moods, who came by, surprises
//   type: custom:nina-surprises-card    the loop workspace's surprises: open, taken, ruled (panel /metis/)
//   type: custom:nina-photos-card       a Google Photos album as a slideshow (album: its name; Home Assistant's
//                                       Google Photos integration: the albums she made and filled)
//   type: custom:nina-video-card        a YouTube playlist (playlist: its id) or video (video: its id), embedded
//   type: custom:nina-bubble-card       her sound bubble: the one sound knob (her voice and the music), as a space
//                                       in the room; the distance calibration's points (room: 5, metres wide)
const EXPAND = import(new URL(`nina-expand.js?v=m${Math.floor(Date.now() / 60000)}`, import.meta.url)); // a card opened large (its own version: fresh each minute, like nina-boot's)
const ASSETS = new URL(".", import.meta.url).pathname;
const PANEL = (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`);
// every answer read as text, then JSON; an error comes as {error} (a plain-text one was "Unexpected token…
// is not valid JSON" on the bubble card, 2026-11-26)
const api = (path, body) => fetch(PANEL + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
  .then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { error: t || r.statusText }; } });

const SCHEME = `
  :host { display: block; }
  ha-card { position: relative; overflow: hidden; padding: 14px 16px; color: #fff; background: #14100e; border: 0;
            --primary-text-color: #fff; --secondary-text-color: rgba(255,255,255,.78); }
  ha-card * { text-shadow: 0 1px 3px rgba(0,0,0,.65); }
  .bg { position: absolute; inset: 0; pointer-events: none; }
  .bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: var(--focus, 50% 30%);
            opacity: 0; transform: scale(1.06); transition: opacity 1.6s ease, transform 9s ease-out; }
  .bg img.on { opacity: 1; transform: scale(1); }
  .bg::after { content: ""; position: absolute; inset: 0;
               background: linear-gradient(to bottom, rgba(10,8,7,.86) 0, rgba(10,8,7,.55) 45%, rgba(10,8,7,.35) 100%); }
  .body { position: relative; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .icon { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.38); }
  .title { font-weight: 600; font-size: 1.1em; } .sub { font-size: .85em; color: rgba(255,255,255,.78); }
  .row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
  .row label { width: 110px; flex: none; color: rgba(255,255,255,.8); font-size: .92em; }
  input, select { flex: 1; min-width: 0; font: inherit; color: #fff; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.25);
                  border-radius: 10px; padding: 7px 10px; }
  select option { color: #000; }
  input[type=range] { padding: 0; accent-color: #d97757; }
  .val { width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
  button { font: inherit; border: 0; border-radius: 999px; padding: 8px 16px; background: #d97757; color: #fff; cursor: pointer; }
  button.ghost { background: rgba(0,0,0,.4); }
  .note { font-size: .8em; color: rgba(255,255,255,.65); margin-top: 6px; }
  .list { max-height: var(--list-height, 300px); overflow-y: auto; }
  .item { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.1); }
  .item .when { width: 46px; flex: none; color: rgba(255,255,255,.6); font-size: .82em; font-variant-numeric: tabular-nums; }
  .item .what { flex: 1; } .item .what b { font-weight: 600; } .item .what div { font-size: .88em; color: rgba(255,255,255,.8); }
  .pill { display: inline-block; font-size: .72em; padding: 1px 8px; border-radius: 999px; background: rgba(255,255,255,.18); margin-left: 6px; }
  .pill.open { background: #d97757; } .pill.ruled { background: #5d8a5b; }
  .empty { color: rgba(255,255,255,.7); padding: 12px 0; }`;

// a card in her scheme: a scene's frames (the first, a pause, the next), a head, a body
class NinaBase extends HTMLElement {
  frame(scene, frames, icon, title, sub) {
    this.sceneName = null;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SCHEME}${this.style || ""}</style><ha-card><div class="bg"></div><div class="body">
      <div class="head"><div class="icon"><ha-icon icon="${icon}"></ha-icon></div><div><div class="title">${title}</div><div class="sub">${sub || ""}</div></div></div>
      <div class="content"></div></div></ha-card>`;
    if (this.c?.focus) this.root.querySelector("ha-card").style.setProperty("--focus", this.c.focus);
    if (this.c?.expanded) this.root.querySelector("ha-card").style.minHeight = "min(70vh, 520px)"; // opened large: large
    if (!this.c?.expanded) { // a single click on its icon: the card large
      const ic = this.root.querySelector(".icon");
      ic.style.cursor = "pointer"; ic.title = "Open large";
      ic.addEventListener("click", async () => {
        const { expand, card } = await EXPAND;
        expand(card(this.localName, { ...this.c, expanded: true, list_height: "62vh" }));
      });
    }
    this.scene(scene, frames);
    return this.root.querySelector(".content");
  }
  // scene: the background's frames, played (the first, a pause, the next); the same scene: kept
  scene(name, frames) {
    if (!name || name === this.sceneName) return;
    this.sceneName = name;
    const bg = this.root.querySelector(".bg");
    (this.tSteps || []).forEach(clearTimeout);
    bg.querySelectorAll("img").forEach((im) => { im.classList.remove("on"); setTimeout(() => im.remove(), 1700); });
    const imgs = [];
    for (let i = 1; i <= (frames || 2); i++) {
      const im = document.createElement("img"); im.src = `${ASSETS}scenes/${name}/${i}.webp`; im.alt = ""; bg.appendChild(im); imgs.push(im);
    }
    requestAnimationFrame(() => imgs[0].classList.add("on"));
    this.tSteps = imgs.slice(1).map((im, i) => setTimeout(() => imgs.forEach((x) => x.classList.toggle("on", x === im)), (i + 1) * 4000));
  }
  set hass(h) { this._hass = h; }
  getCardSize() { return 4; }
}

// ---- settings ---------------------------------------------------------------------------------
class NinaSettingsCard extends NinaBase {
  setConfig(c) {
    this.c = c || {};
    if (this.root) return;
    const el = this.frame("explain", 2, "mdi:account-cog", "Nina", "her name, her face, her voice, her temperament");
    el.innerHTML = `
      <div class="row"><label>Name</label><input class="name" placeholder="Nina"></div>
      <div class="row"><label>Persona</label><select class="persona"><option value="auto">automatic (her temperament)</option></select></div>
      <div class="row"><label>Voice</label><select class="voice"></select></div>
      <div class="row"><label>Temperament</label><input type="range" class="w0" min="0" max="1" step="0.05"><span class="val v0"></span></div>
      <div class="row"><label>The hour</label><input type="range" class="w1" min="0" max="1" step="0.05"><span class="val v1"></span></div>
      <div class="row"><label>Activity</label><input type="range" class="w2" min="0" max="1" step="0.05"><span class="val v2"></span></div>
      <div class="row"><label>A mood holds</label><input type="range" class="ms" min="15" max="240" step="15"><span class="val vms"></span></div>
      <div class="row"><label>Mood swing</label><input type="range" class="adv" min="0" max="0.2" step="0.01"><span class="val vadv"></span></div>
      <div class="row"><button class="save">Save</button><button class="ghost reset">Her file's</button><span class="note msg"></span></div>
      <div class="note">The temperament, the hour and what the home is doing choose her mood; a mood holds a while, and a new one needs the swing's margin to win. The wake word stays "Nina".</div>`;
    const q = (s) => this.root.querySelector(s);
    const show = () => { q(".v0").textContent = (+q(".w0").value).toFixed(2); q(".v1").textContent = (+q(".w1").value).toFixed(2);
      q(".v2").textContent = (+q(".w2").value).toFixed(2); q(".vms").textContent = q(".ms").value + "m"; q(".vadv").textContent = (+q(".adv").value).toFixed(2); };
    this.root.querySelectorAll("input[type=range]").forEach((r) => r.addEventListener("input", show));
    const load = () => api("/api/state").then((s) => {
      const st = s.facts?.settings || {};
      q(".name").value = st.name || "";
      const ps = q(".persona");
      ps.querySelectorAll("option:not([value=auto])").forEach((o) => o.remove());
      for (const p of st.personas || []) { const [art, mood] = p.split(":"); const o = document.createElement("option"); o.value = art; o.textContent = `${art} (${mood})`; ps.appendChild(o); }
      ps.value = st.persona && st.persona !== "" ? st.persona : "auto";
      const vs = q(".voice"); vs.replaceChildren();
      for (const v of s.choices?.voice_name || []) { const o = document.createElement("option"); o.value = o.textContent = v; vs.appendChild(o); }
      vs.value = s.prefs?.voice_name || "";
      const w = st.weights || [0.45, 0.45, 0.1];
      q(".w0").value = w[0]; q(".w1").value = w[1]; q(".w2").value = w[2];
      q(".ms").value = parseInt(st.min_stay) * (String(st.min_stay).includes("h") ? 60 : 1) + (String(st.min_stay).match(/h(\d+)m/) ? +String(st.min_stay).match(/h(\d+)m/)[1] : 0) || 90;
      q(".adv").value = st.advantage ?? 0.06;
      show();
    }).catch(() => { q(".msg").textContent = "her panel is not reachable"; });
    load();
    q(".save").addEventListener("click", async () => {
      try {
        await api("/api/do", { action: "name", arg: q(".name").value });
        await api("/api/do", { action: "persona", arg: q(".persona").value });
        await api("/api/prefs", { voice_name: q(".voice").value });
        await api("/api/do", { action: "temperament", arg: JSON.stringify({ weights: [+q(".w0").value, +q(".w1").value, +q(".w2").value], min_stay: q(".ms").value + "m", advantage: +q(".adv").value }) });
        q(".msg").textContent = "saved"; setTimeout(() => (q(".msg").textContent = ""), 3000);
      } catch (e) { q(".msg").textContent = "not saved: " + e; }
    });
    q(".reset").addEventListener("click", async () => { await api("/api/do", { action: "temperament", arg: "{}" }).catch(() => {}); setTimeout(load, 500); });
  }
}

// ---- the sound bubble ---------------------------------------------------------------------------
// The one sound knob (the user, 2026-11-25: not a sound level, the sound bubble: a 5-metre room, you
// put the bubble and she operates in that space). Her voice and the music carry to its edge: 1 m is
// the acoustic calibration's minimum (as loud at the array as a person), each doubling `slope` dB
// more, up to the echo canceller's limit (+12 dB). The distance calibration: stand somewhere, set
// the bubble until she is comfortable there, Save: the slope is fitted to the points.
const MAX_GAIN = 12; // fsttm-live audio.MaxGain
class NinaBubbleCard extends NinaBase {
  get style() {
    return `.plan { width: 100%; display: block; border-radius: 12px; background: rgba(0,0,0,.35); touch-action: none; cursor: crosshair; }
      .plan .grid { stroke: rgba(255,255,255,.08); stroke-width: .02; }
      .plan .wall { fill: none; stroke: rgba(255,255,255,.35); stroke-width: .05; }
      .plan .edge { fill: none; stroke: #f0a37f; stroke-width: .05; }
      .plan .limit { fill: none; stroke: rgba(255,255,255,.3); stroke-width: .03; stroke-dasharray: .12 .1; }
      .plan .ripple { fill: none; stroke: #f0a37f; stroke-width: .04; }
      .plan text { fill: rgba(255,255,255,.7); font: .22px system-ui, sans-serif; }
      .plan .pt { fill: #fff; } .plan .who { fill: #7fc7f0; }
      .read { font-variant-numeric: tabular-nums; }
      .row button { padding: 8px 14px; } .row input.d { flex: none; width: 64px; }`;
  }
  setConfig(c) {
    this.c = c || {};
    if (this.root) return;
    this.W = this.c.room || 5; this.H = this.c.depth || Math.round(this.W * 0.7 * 10) / 10;
    const W = this.W, H = this.H, nx = 0.25, ny = H / 2;
    this.at = [nx, ny];
    const el = this.frame("music", 2, "mdi:surround-sound", "Sound bubble", "how far her voice and the music carry");
    let grid = "";
    for (let x = 1; x < W; x++) grid += `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
    for (let y = 1; y < H; y++) grid += `<line class="grid" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    el.innerHTML = `
      <svg class="plan" viewBox="-0.1 -0.1 ${W + 0.2} ${H + 0.2}">
        <defs><radialGradient id="glow"><stop offset="0" stop-color="#d97757" stop-opacity=".55"/><stop offset="1" stop-color="#d97757" stop-opacity=".08"/></radialGradient>
          <clipPath id="room"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
        ${grid}
        <g clip-path="url(#room)">
          <circle class="limit" cx="${nx}" cy="${ny}" r="4"/>
          <circle class="fill" cx="${nx}" cy="${ny}" r="1" fill="url(#glow)"/>
          ${[0, 1, 2].map((i) => `<circle class="ripple" cx="${nx}" cy="${ny}" r="0"><animate attributeName="r" from="0" to="1" dur="3s" begin="${i}s" repeatCount="indefinite"/><animate attributeName="opacity" from=".9" to="0" dur="3s" begin="${i}s" repeatCount="indefinite"/></circle>`).join("")}
          <circle class="edge" cx="${nx}" cy="${ny}" r="1"/>
          <g class="pts"></g>
          <circle class="who" cx="-9" cy="${ny}" r=".12"/>
        </g>
        <rect class="wall" x="0" y="0" width="${W}" height="${H}"/>
        <rect x="${nx - 0.12}" y="${ny - 0.22}" width=".16" height=".44" rx=".04" fill="#d97757"/>
        <text x="${nx + 0.1}" y="${ny + 0.55}">Nina</text>
        <text x="${W - 0.55}" y="${H - 0.12}">${W} m</text>
      </svg>
      <div class="row"><span class="read r"></span></div>
      <div class="row"><button class="ghost minus" title="quieter: her last words again">−</button><button class="ghost plus" title="louder: her last words again">+</button>
        <button class="ghost hear">▶ Hear her</button><span class="note msg"></span></div>
      <div class="row"><label>Comfortable at</label><input class="d" type="number" min="0.5" max="12" step="0.1" value="2"> m
        <button class="here save" title="she is comfortable at this distance: the point is kept">Save</button><button class="ghost reset" title="forget the distance points">Reset</button></div>
      <div class="note">Drag the bubble's edge, or − and +: her voice and the music carry to it. To calibrate, stand where you sit, size the bubble until she is comfortable there, then Save. The dashed ring is the echo canceller's limit.</div>`;
    const q = (s) => this.root.querySelector(s);
    const svg = q(".plan");
    const say = (t) => { q(".msg").textContent = t; clearTimeout(this.tm); this.tm = setTimeout(() => (q(".msg").textContent = ""), 4000); };
    const point = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = p.matrixTransform(svg.getScreenCTM().inverse()); return Math.hypot(m.x - nx, m.y - ny); };
    let drag = false;
    svg.addEventListener("pointerdown", (e) => { drag = true; svg.setPointerCapture(e.pointerId); this.draw(point(e)); });
    svg.addEventListener("pointermove", (e) => drag && this.draw(point(e)));
    svg.addEventListener("pointerup", async (e) => {
      if (!drag) return; drag = false;
      const b = this.clamp(point(e));
      try { const r = await api("/api/prefs", { bubble: Math.round(b * 100) / 100 }); if (r.error) throw r.error; await api("/api/do", { action: "sample" }).catch(() => {}); }
      catch (err) { say(String(err)); }
      this.load();
    });
    const act = (a, arg) => api("/api/do", { action: a, arg: arg || "" }).then((r) => { if (r?.error) say(r.error); setTimeout(() => this.load(), 300); return r; }).catch((e) => { say(String(e)); return { error: e }; });
    q(".minus").addEventListener("click", () => act("quieter"));
    q(".plus").addEventListener("click", () => act("louder"));
    q(".hear").addEventListener("click", () => act("sample"));
    q(".d").addEventListener("input", () => { this.dTyped = true; });
    q(".here").addEventListener("click", () => act("bubble_here", q(".d").value).then((r) => { if (!r?.error) { say("saved"); this.dTyped = false; } }));
    q(".reset").addEventListener("click", () => act("bubble_reset"));
    this.load();
    this.tw = setInterval(() => this.who(), 5000);
  }
  disconnectedCallback() { clearInterval(this.tw); }
  connectedCallback() { if (this.root && !this.tw) this.tw = setInterval(() => this.who(), 5000); }
  slope() { return this.p?.bubble_slope || 6; }
  off() { return this.p?.bubble_offset || 0; } // the distance calibration's dB at 1 m
  max() { return Math.pow(2, (MAX_GAIN - this.off()) / this.slope()); }
  clamp(b) { return Math.max(0.5, Math.min(this.max(), b)); }
  load() {
    return api("/api/state").then((s) => { this.p = s.prefs || {}; this.draw(this.p.bubble || 1); this.who(); })
      .catch(() => (this.root.querySelector(".r").textContent = "her panel is not reachable"));
  }
  draw(b) {
    const q = (s) => this.root.querySelector(s);
    b = this.clamp(b);
    for (const c of this.root.querySelectorAll(".fill, .edge")) c.setAttribute("r", b);
    for (const a of this.root.querySelectorAll(".ripple animate[attributeName=r]")) a.setAttribute("to", b);
    q(".limit").setAttribute("r", this.max());
    const g = this.off() + this.slope() * Math.log2(b);
    q(".r").textContent = `${b.toFixed(1)} m · ${g >= 0 ? "+" : ""}${g.toFixed(1)} dB over the minimum · ${this.slope()} dB per doubling · limit ${this.max().toFixed(1)} m`;
    const [nx, ny] = this.at;
    q(".pts").innerHTML = (this.p?.bubble_points || []).map(([d], i) => {
      const a = (i % 5 - 2) * 0.35; // fanned out, so points at one distance stay apart
      return `<circle class="pt" cx="${nx + d * Math.cos(a)}" cy="${ny + d * Math.sin(a)}" r=".07"><title>${d} m</title></circle>`;
    }).join("");
  }
  // the person, from the radar (her panel's presence events), on her axis
  who() {
    api("/api/recent").then((r) => {
      const ev = (r || []).filter((e) => e.ev === "presence").pop();
      const d = ev?.distance;
      const c = this.root.querySelector(".who");
      // the field follows the radar until the person types in it (it was reset every 5 s to a stale 0.5 m:
      // the user, 2026-11-26); Save gives it back to the radar
      if (d && ev.kind !== "left") { c.setAttribute("cx", this.at[0] + d); if (!this.dTyped) this.root.querySelector(".d").value = (+d).toFixed(1); }
      else c.setAttribute("cx", -9);
    }).catch(() => {});
  }
}

// ---- photos and videos ------------------------------------------------------------------------
// The office's gallery and videos (the user, 2026-11-26: Home Assistant's own media, no media system of
// ours). Photos: Home Assistant's Google Photos integration (since March 2025 Google lets an app see only
// what it uploaded: the albums Nina made and filled), browsed and resolved through its media source; a
// resolved address lasts about an hour, so each photo is resolved as it is shown. Videos: YouTube's
// player, embedded from youtube-nocookie.com, muted and looping by default (a referrer sent: YouTube's
// player refuses without one).
class NinaPhotosCard extends HTMLElement {
  setConfig(c) {
    this.c = Object.assign({ album: "Nina's gallery", interval: 10, title: "Gallery", icon: "mdi:image-multiple", height: "320px" }, c || {});
    if (this.root) return;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SCHEME}
      ha-card { padding: 0; height: var(--h); }
      .pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.4s ease; }
      .pic.on { opacity: 1; }
      .bar { position: absolute; left: 0; right: 0; top: 0; padding: 12px 16px;
             background: linear-gradient(to bottom, rgba(10,8,7,.7), transparent); }
      .count { position: absolute; right: 14px; bottom: 10px; font-size: .8em; color: rgba(255,255,255,.75); }
    </style><ha-card><img class="pic" alt=""><img class="pic" alt="">
      <div class="bar"><div class="head"><div class="icon"><ha-icon icon="${this.c.icon}"></ha-icon></div>
        <div><div class="title">${this.c.title}</div><div class="sub">${this.c.album}</div></div></div></div>
      <div class="count"></div></ha-card>`;
    this.root.querySelector("ha-card").style.setProperty("--h", this.c.height);
  }
  set hass(h) { this._hass = h; if (!this.items && !this.loading) this.load(); }
  connectedCallback() { if (this.items && !this.tm) this.next(); else if (this.c.scenes && !this.items && !this.loading) this.load(); }
  disconnectedCallback() { clearTimeout(this.tm); this.tm = null; }
  async load() {
    this.loading = true;
    const ws = (id) => this._hass.callWS({ type: "media_source/browse_media", media_content_id: id });
    if (this.c.scenes) { // the Codex scenes (www/nina/scenes): the gallery where there is no Google Photos (Pascal)
      const sc = await fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => ({ frames: {} }));
      this.items = Object.entries(sc.frames || {}).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${ASSETS}scenes/${k}/${i + 1}.webp`));
      this.root.querySelector(".sub").textContent = this.c.sub || "Nina's scenes";
    } else try {
      const root = await ws("media-source://google_photos");
      for (const acct of root.children || []) {
        const albums = await ws(acct.media_content_id);
        const key = (t) => String(t || "").toLowerCase().replace(/['’‘`]/g, "").replace(/\s+/g, " ").trim(); // "Nina's Gallery" as said
        const al = (albums.children || []).find((a) => key(a.title) === key(this.c.album));
        if (!al) continue;
        const pics = await ws(al.media_content_id);
        this.items = (pics.children || []).filter((p) => p.media_class === "image").map((p) => p.media_content_id);
        break;
      }
    } catch (e) { this.root.querySelector(".sub").textContent = "Google Photos: " + (e.message || e); }
    this.loading = false;
    if (!this.items?.length) {
      // Google Photos' first answer after Home Assistant restarted came back empty (pero, 2026-11-26):
      // twice more, 4 s apart, before saying so
      if ((this.tries = (this.tries || 0) + 1) < 3) { setTimeout(() => this.isConnected && this.load(), 4000); return; }
      this.root.querySelector(".sub").textContent = `no album "${this.c.album}"`; return;
    }
    for (let i = this.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.items[i], this.items[j]] = [this.items[j], this.items[i]]; }
    this.i = -1; this.next();
  }
  // step: d photos on (-1 the previous); pause: the slideshow held or going on
  step(d) { if (!this.items?.length) return; this.i = (this.i + d - 1 + 2 * this.items.length) % this.items.length; this.next(); }
  pause(on) { this.paused = on; if (on) clearTimeout(this.tm); else this.next(); }
  async next() {
    clearTimeout(this.tm);
    if (!this.isConnected || !this.items?.length) return;
    this.i = (this.i + 1) % this.items.length;
    try {
      const id = this.items[this.i];
      const r = id.startsWith("/") || id.startsWith("http") ? { url: id } : await this._hass.callWS({ type: "media_source/resolve_media", media_content_id: id });
      const [a, b] = this.root.querySelectorAll(".pic");
      const show = a.classList.contains("on") ? b : a, hide = show === a ? b : a;
      show.onload = () => { show.classList.add("on"); hide.classList.remove("on"); };
      show.src = r.url;
      this.root.querySelector(".count").textContent = `${this.i + 1} / ${this.items.length}`;
    } catch (e) { /* this one failed: the next */ }
    if (!this.paused) this.tm = setTimeout(() => this.next(), this.c.interval * 1000);
  }
  getCardSize() { return 6; }
}

class NinaVideoCard extends HTMLElement {
  setConfig(c) {
    this.c = Object.assign({ title: "Videos", icon: "mdi:youtube", mute: true, autoplay: true, loop: true, height: "320px", close: false }, c || {});
    if (!this.c.playlist && !this.c.video) throw new Error("nina-video-card: playlist or video");
    // enablejsapi: the player takes commands from this page (her controls below; the user, 2026-11-26:
    // previous, next, play, mute, close)
    const q = new URLSearchParams({ autoplay: this.c.autoplay ? 1 : 0, mute: this.c.mute ? 1 : 0, loop: this.c.loop ? 1 : 0,
      playsinline: 1, rel: 0, modestbranding: 1, controls: 0, enablejsapi: 1, origin: location.origin });
    let src;
    if (this.c.playlist) { q.set("list", this.c.playlist); src = `https://www.youtube-nocookie.com/embed/videoseries?${q}`; }
    else { if (this.c.loop) q.set("playlist", this.c.video); src = `https://www.youtube-nocookie.com/embed/${this.c.video}?${q}`; }
    if (!this.root) this.root = this.attachShadow({ mode: "open" });
    this.muted = !!this.c.mute; this.playing = !!this.c.autoplay;
    this.root.innerHTML = `<style>${SCHEME}
      ha-card { padding: 0; height: var(--h); background: #000; }
      iframe { position: absolute; inset: 0; width: 100%; height: calc(100% - 52px); border: 0; }
      .bar { position: absolute; left: 0; top: 0; padding: 12px 16px; pointer-events: none; }
      .ctl { position: absolute; left: 0; right: 0; bottom: 0; height: 52px; display: flex; align-items: center; justify-content: center;
             gap: 10px; background: linear-gradient(to top, rgba(20,16,14,.95), rgba(20,16,14,.75)); }
      .ctl button { width: 44px; height: 40px; padding: 0; border-radius: 999px; background: rgba(255,255,255,.12); font-size: 18px; line-height: 40px; }
      .ctl button.main { width: 56px; background: var(--primary-color, #d97757); }
      .ctl .x { position: absolute; right: 10px; }
    </style><ha-card><iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin" title="${this.c.title}" src="${src}"></iframe>
      ${this.c.show_title ? `<div class="bar"><div class="head"><div class="icon"><ha-icon icon="${this.c.icon}"></ha-icon></div><div class="title">${this.c.title}</div></div></div>` : ""}
      <div class="ctl">
        <button data-f="previousVideo" title="Previous">⏮</button>
        <button class="main" data-f="play" title="Play or pause">⏸</button>
        <button data-f="nextVideo" title="Next">⏭</button>
        <button data-f="mute" title="Sound on or off">🔇</button>
        ${this.c.close ? `<button class="x" data-f="close" title="Close">✕</button>` : ""}
      </div></ha-card>`;
    this.root.querySelector("ha-card").style.setProperty("--h", this.c.height);
    const fr = this.root.querySelector("iframe");
    const cmd = (func, args = []) => fr.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    fr.addEventListener("load", () => fr.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*"));
    this.root.querySelectorAll(".ctl button").forEach((b) => b.addEventListener("click", () => {
      const f = b.dataset.f;
      if (f === "play") cmd(this.playing ? "pauseVideo" : "playVideo");
      else if (f === "mute") cmd(this.muted ? "unMute" : "mute"), this.show(undefined, !this.muted);
      else if (f === "close") this.close();
      else cmd(f);
    }));
    this.onMsg = (e) => { // the player's state: the play and mute buttons follow it
      if (e.source !== fr.contentWindow) return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      const info = d.info || {};
      this.show(info.playerState !== undefined ? info.playerState === 1 || info.playerState === 3 : undefined, info.muted);
    };
  }
  show(playing, muted) {
    if (playing !== undefined) { this.playing = playing; this.root.querySelector('[data-f="play"]').textContent = playing ? "⏸" : "▶"; }
    if (muted !== undefined) { this.muted = muted; this.root.querySelector('[data-f="mute"]').textContent = muted ? "🔇" : "🔊"; }
  }
  // close: her own screen's home page (this dashboard's), in Home Assistant's navigation (no reload)
  close() {
    const home = location.pathname.replace(/\/[^/]*$/, "/home") + location.search;
    history.pushState(null, "", home);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }
  connectedCallback() { window.addEventListener("message", this.onMsg); }
  disconnectedCallback() { window.removeEventListener("message", this.onMsg); }
  set hass(h) {}
  getCardSize() { return 6; }
}


// ---- the stage: videos and photos on request (the user, 2026-11-26) --------------------------------
// Not cards on the screen all the time: a picture in picture over the right side of Nina's screen,
// large (more room than a card) or shrunk to a corner, closed with its ✕. It opens when she is asked
// (her tool "screen": show videos, photos, or close) or from its launchers, a slim row in her right
// column. Videos: YouTube's player with its own controls (previous, play, next, a volume slider,
// mute), ducked under her voice and under the person speaking to her, as the radio is; the radio
// paused while one plays. Photos: the gallery (nina-photos-card) with previous, pause, next. While a
// video plays the screen stays awake (Firefox holds it); closed, nothing does.
//
//   type: custom:nina-stage-card
//   videos: {playlist: PLSh0S6uPqqgA}          # or video: <id>
//   photos: {album: "Nina's gallery", interval: 10}
//   pause: media_player.music_player_daemon    # paused when a video starts (optional)
const stageStream = (panel) => ((window.__ninaStreams ||= {})[panel] ||= (() => {
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

const Stage = window.__ninaStage ||= {
  conf: null, el: null, what: null, big: true, vol: 60, duck: false,
  cards: {}, confs: {}, // the docked cards (nina-media-card) and their configs, by what they show
  cfg(what) { return this.confs[what] || this.conf?.[what]; },
  pauseOf(what) { return this.confs[what + ":pause"] || this.conf?.pause; },
  // where it flies: large over the right side (all of a narrow page: her own screen's right half), or
  // small in the corner
  rect(big) {
    const W = innerWidth, H = innerHeight, m = 8;
    if (big) { const w = W < 760 ? W - 2 * m : Math.round(W * 0.64); return { left: W - m - w, top: m, width: w, height: H - 2 * m }; }
    const w = Math.round(W < 760 ? W * 0.62 : W * 0.34); const h = Math.round(w * 9 / 16 + 52);
    return { left: W - m - w, top: H - m - h, width: w, height: h };
  },
  place(r) { const p = this.root?.querySelector(".pip"); if (p) for (const k of ["left", "top", "width", "height"]) p.style[k] = r[k] + "px"; },
  docked(what) { const c = this.cards[what]; return c && c.isConnected && c.getBoundingClientRect().width > 0 ? c : null; },
  hass() { return document.querySelector("home-assistant")?.hass; },
  listen(panel) {
    if (this.panel) return;
    this.panel = panel;
    const s = stageStream(panel);
    s.addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      if (e.ev === "stage") { // what her screen tool found: videos (ids), a playlist, an album
        if (e.show === "close") this.close();
        else if (this.el && ({ next: 1, previous: 1, pause: 1, play: 1 })[e.show]) { // on what is shown: its ⏭ ⏮ ⏸ ▶
          if (e.show === "next" || e.show === "previous") this.act(e.show === "next" ? "next" : "prev");
          else if ((e.show === "pause") === !!this.playing) this.act("play");
        }
        else if (e.show === "videos" || e.show === "photos") this.open(e.show, { videos: e.videos, playlist: e.playlist, album: e.album, title: e.title });
        return;
      }
      if (e.ev === "attention" && e.awake === false && e.told) { this.close(); return; } // told to sleep: closed (asleep by itself: kept)
      if (e.ev !== "tool" || e.name !== "screen") return;
      const a = e.args || {};
      if (a.query || a.playlist || a.album) return; // its stage event says what (an older nina-live: the plain one)
      if (a.show === "close") this.close(); else if (a.show === "videos" || a.show === "photos") this.open(a.show);
    });
    s.addEventListener("status", (m) => { // ducked while she speaks, or the person speaks to her
      const st = JSON.parse(m.data);
      const d = !!(st.speaking || st.replying || (st.awake && String(st.floor || "").startsWith("USER")));
      if (d !== this.duck) { this.duck = d; this.volume(); }
    });
  },
  open(what, opts) {
    const o = opts && (opts.videos?.length || opts.playlist || opts.album) ? opts : null; // something found, not the card's own
    if (!this.cfg(what) && !o) return;
    if (this.what === what && !o) { if (!this.big) this.act("size"); return; }
    this.opts = o;
    this.close(true);
    this.what = what;
    const host = document.createElement("div");
    host.id = "nina-stage";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .pip { position: fixed; z-index: 9000; background: #000; border-radius: 16px; overflow: hidden;
             box-shadow: 0 6px 28px rgba(0,0,0,.6); font: 15px system-ui, sans-serif;
             transition: left .45s cubic-bezier(.2,.8,.2,1), top .45s cubic-bezier(.2,.8,.2,1), width .45s cubic-bezier(.2,.8,.2,1),
                         height .45s cubic-bezier(.2,.8,.2,1), border-radius .45s ease, opacity .3s ease; }
      .pip.docked { border-radius: 12px; }
      .pip.docked .ctl { opacity: 0; } .ctl { transition: opacity .3s ease .2s; }
      .body { position: absolute; left: 0; right: 0; top: 0; bottom: 52px; }
      .body iframe, .body > * { width: 100%; height: 100%; border: 0; display: block; }
      .ctl { position: absolute; left: 0; right: 0; bottom: 0; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 10px;
             background: linear-gradient(to top, rgba(20,16,14,.97), rgba(20,16,14,.8)); color: #f3ece6; }
      button { width: 42px; height: 38px; border: 0; border-radius: 999px; background: rgba(255,255,255,.13); color: inherit; font-size: 17px; cursor: pointer; }
      button.main { width: 54px; background: #d97757; color: #fff; }
      .sp { flex: 1; }
      input[type=range] { width: 22%; min-width: 90px; accent-color: #d97757; }
      .pip.small input[type=range] { display: none; }
    </style><div class="pip"><div class="body"></div><div class="ctl">
      <button data-f="prev" title="Previous">⏮</button><button class="main" data-f="play" title="Play or pause">⏸</button>
      <button data-f="next" title="Next">⏭</button>
      ${what === "videos" ? `<button data-f="mute" title="Sound on or off">🔊</button><input type="range" min="0" max="100" value="${this.vol}" title="Volume">` : ""}
      <span class="sp"></span><button data-f="size" title="Smaller or larger">⤡</button><button data-f="close" title="Close">✕</button></div></div>`;
    this.root = root;
    const body = root.querySelector(".body");
    const pip = root.querySelector(".pip");
    pip.classList.toggle("small", !this.big);
    if (what === "videos") this.video(body); else this.photos(body);
    root.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this.act(b.dataset.f)));
    root.querySelector("input")?.addEventListener("input", (ev) => { this.vol = +ev.target.value; this.muted = false; this.volume(); });
    // it flies out of its card (where one is docked on this page), or appears where it goes
    const card = this.docked(what);
    if (card) { const r = card.getBoundingClientRect(); this.place(r); pip.classList.add("docked"); card.away(true); }
    else { this.place(this.rect(this.big)); pip.style.opacity = 0; }
    document.body.appendChild(host);
    this.el = host;
    requestAnimationFrame(() => requestAnimationFrame(() => { pip.classList.remove("docked"); pip.style.opacity = 1; this.place(this.rect(this.big)); }));
    this.onResize ||= () => this.place(this.rect(this.big));
    addEventListener("resize", this.onResize);
  },
  video(body) {
    const c = this.cfg("videos") || {};
    const o = this.opts || {};
    // muted at the start: unmuted at the slider's level once the player is ready (no second at YouTube's own)
    const q = new URLSearchParams({ autoplay: 1, mute: 1, loop: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, enablejsapi: 1, origin: location.origin });
    let src;
    if (o.videos?.length) { q.set("playlist", o.videos.join(",")); src = `https://www.youtube-nocookie.com/embed/${o.videos[0]}?${q}`; } // a search's: ⏮ ⏭ go through them
    else if (o.playlist || c.playlist) { q.set("list", o.playlist || c.playlist); src = `https://www.youtube-nocookie.com/embed/videoseries?${q}`; }
    else { q.set("playlist", c.video); src = `https://www.youtube-nocookie.com/embed/${c.video}?${q}`; }
    body.innerHTML = `<iframe allow="autoplay; encrypted-media; fullscreen" referrerpolicy="strict-origin-when-cross-origin" title="Videos" src="${src}"></iframe>`;
    const fr = body.querySelector("iframe");
    this.cmd = (func, args = []) => fr.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    // the handshake, as YouTube's own API does it: "listening" again until the player answers (at the
    // iframe's load it is not ready yet); its first answer: the slider's volume, and play
    this.playing = false; this.muted = false;
    const hello = setInterval(() => fr.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*"), 400);
    let ready = false;
    this.onMsg = (e) => {
      if (e.source !== fr.contentWindow) return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (!ready) { ready = true; clearInterval(hello); this.volume(); this.cmd("playVideo"); }
      const i = d.info || {};
      if (i.playerState !== undefined) { this.playing = i.playerState === 1 || i.playerState === 3; this.mark(); }
      if (i.videoData?.video_id) { localStorage.setItem("nina-last-video", i.videoData.video_id); this.cards.videos?.thumb?.(); }
    };
    this.stopHello = () => clearInterval(hello);
    window.addEventListener("message", this.onMsg);
    const pause = this.pauseOf("videos");
    if (pause) { // the radio stops for the video
      const h = this.hass(), st = h?.states[pause]?.state;
      if (st === "playing") h.callService("media_player", "media_pause", { entity_id: pause });
    }
  },
  photos(body) {
    const p = document.createElement("nina-photos-card");
    const pc = Object.assign({ title: "Gallery", height: "100%" }, this.cfg("photos"));
    if (this.opts?.album) { pc.album = this.opts.album; delete pc.scenes; } // an album asked for by name
    p.setConfig(pc);
    body.appendChild(p);
    const h = this.hass();
    if (h) p.hass = h;
    this.pics = p; this.playing = true;
  },
  volume() { // the slider's level, a quarter of it while she or the person speaks
    if (!this.cmd || this.what !== "videos") return;
    if (this.muted) { this.cmd("mute"); return; }
    this.cmd("unMute");
    this.cmd("setVolume", [Math.round(this.duck ? this.vol / 4 : this.vol)]);
  },
  mark() {
    const r = this.root; if (!r) return;
    r.querySelector('[data-f="play"]').textContent = this.playing ? "⏸" : "▶";
    const m = r.querySelector('[data-f="mute"]'); if (m) m.textContent = this.muted ? "🔇" : "🔊";
  },
  act(f) {
    if (f === "close") return this.close();
    if (f === "size") { this.big = !this.big; this.root.querySelector(".pip").classList.toggle("small", !this.big); this.place(this.rect(this.big)); return; }
    if (this.what === "videos") {
      if (f === "prev") this.cmd("previousVideo");
      else if (f === "next") this.cmd("nextVideo");
      else if (f === "play") this.cmd(this.playing ? "pauseVideo" : "playVideo");
      else if (f === "mute") { this.muted = !this.muted; this.volume(); this.mark(); }
    } else {
      if (f === "prev") this.pics.step(-1);
      else if (f === "next") this.pics.step(1);
      else if (f === "play") { this.playing = !this.playing; this.pics.pause(!this.playing); this.mark(); }
    }
  },
  // close: back into its card (where one is docked), or faded; now: at once (another opens)
  close(now) {
    if (!this.el) return;
    this.stopHello?.();
    if (this.onMsg) window.removeEventListener("message", this.onMsg);
    removeEventListener("resize", this.onResize);
    const el = this.el, what = this.what, pip = this.root?.querySelector(".pip"), card = this.docked(what);
    this.el = this.root = this.cmd = this.onMsg = this.pics = this.stopHello = null;
    this.what = null;
    if (now || !pip) { el.remove(); this.cards[what]?.away(false); return; }
    if (card) {
      const r = card.getBoundingClientRect();
      pip.classList.add("docked");
      for (const k of ["left", "top", "width", "height"]) pip.style[k] = r[k] + "px";
      setTimeout(() => { el.remove(); card.away(false); }, 460);
    } else { pip.style.opacity = 0; setTimeout(() => el.remove(), 320); }
  },
};

class NinaStageCard extends HTMLElement {
  setConfig(c) {
    this.c = c || {};
    Stage.conf = this.c;
    Stage.listen(this.c.panel || (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`));
    if (this.root) return;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SCHEME}
      ha-card { padding: 6px 10px; display: flex; gap: 8px; align-items: center; }
      button { flex: 1; height: 38px; border-radius: 999px; background: rgba(255,255,255,.09); font-size: 15px; }
    </style><ha-card>
      ${this.c.videos ? `<button data-w="videos" title="Videos, large on the screen">▶ Videos</button>` : ""}
      ${this.c.photos ? `<button data-w="photos" title="The gallery, large on the screen">🖼 Photos</button>` : ""}</ha-card>`;
    this.root.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => Stage.open(b.dataset.w)));
  }
  set hass(h) { if (Stage.pics && !Stage.pics._hass) Stage.pics.hass = h; }
  getCardSize() { return 1; }
}

// The dynamic cards (the user, 2026-11-26): Videos and Photos as cards of her column, like the
// others; asked for (her tool "screen", or a tap) the card leaves the panel and grows into the picture
// in picture with its controls, its place kept; closed, it flies back into it.
//
//   type: custom:nina-media-card
//   show: videos | photos
//   videos: {playlist: PLSh0S6uPqqgA}       # show: videos
//   photos: {album: "Nina's gallery"} | {scenes: true}   # show: photos (Google Photos, or her scenes)
//   pause: media_player.music_player_daemon # paused when a video starts (optional)
//   title, icon, scene (the background where there is no picture yet), height (default 108px)
class NinaMediaCard extends HTMLElement {
  setConfig(c) {
    const v = c?.show === "photos";
    this.c = Object.assign({ show: "videos", title: v ? "Photos" : "Videos", icon: v ? "mdi:image-multiple" : "mdi:youtube",
      scene: v ? "fortune" : "music", height: "108px" }, c || {});
    const w = this.c.show;
    Stage.cards[w] = this;
    Stage.confs[w] = this.c[w];
    if (this.c.pause) Stage.confs[w + ":pause"] = this.c.pause;
    Stage.listen(this.c.panel || (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`));
    if (this.root) return;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SCHEME}
      ha-card { height: var(--h); padding: 12px 14px; cursor: pointer; transition: opacity .3s ease; }
      .bg img { opacity: 1; transform: none; transition: opacity 1.2s ease; }
      .bg img.off { opacity: 0; }
      .go { position: absolute; right: 12px; bottom: 12px; width: 40px; height: 40px; padding: 0; border-radius: 50%; font-size: 17px; }
      .gone { position: absolute; inset: 0; display: none; place-items: center; border: 2px dashed rgba(255,255,255,.35);
              border-radius: inherit; color: rgba(255,255,255,.8); font-size: .9em; background: rgba(10,8,7,.55); }
      ha-card.away .gone { display: grid; } ha-card.away .body, ha-card.away .go { visibility: hidden; }
    </style><ha-card><div class="bg"><img alt=""><img class="off" alt=""></div>
      <div class="body"><div class="head"><div class="icon"><ha-icon icon="${this.c.icon}"></ha-icon></div>
        <div><div class="title">${this.c.title}</div><div class="sub"></div></div></div></div>
      <button class="go" title="Large on the screen">${w === "photos" ? "⤢" : "▶"}</button>
      <div class="gone">on the screen ↗</div></ha-card>`;
    const card = this.root.querySelector("ha-card");
    card.style.setProperty("--h", this.c.height);
    card.addEventListener("click", () => Stage.open(w));
    this.root.querySelector(".sub").textContent = w === "photos" ? (this.c.photos?.album || "her scenes") : "ask Nina, or tap";
    this.thumb();
  }
  // the background: the last video's still (videos), the gallery turning slowly (photos), or the scene
  async thumb() {
    const imgs = this.root.querySelectorAll(".bg img");
    const show = (url) => { const [a, b] = imgs; const on = a.classList.contains("off") ? a : b, off = on === a ? b : a;
      on.onload = () => { on.classList.remove("off"); off.classList.add("off"); }; on.src = url; };
    if (this.c.show === "videos") {
      const id = localStorage.getItem("nina-last-video");
      show(id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : `${ASSETS}scenes/${this.c.scene}/1.webp`);
      return;
    }
    clearInterval(this.turn);
    const sc = await fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => ({ frames: {} }));
    const urls = Object.entries(sc.frames || {}).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${ASSETS}scenes/${k}/${i + 1}.webp`));
    if (!urls.length) return;
    let i = Math.floor(Math.random() * urls.length);
    show(urls[i]);
    this.turn = setInterval(() => this.isConnected && show(urls[(i = (i + 1) % urls.length)]), 9000);
  }
  away(on) { this.root?.querySelector("ha-card").classList.toggle("away", on); }
  connectedCallback() { if (Stage.what === this.c?.show) this.away(true); if (this.root && !this.turn && this.c.show === "photos") this.thumb(); }
  disconnectedCallback() { clearInterval(this.turn); this.turn = null; }
  set hass(h) { if (Stage.pics && !Stage.pics._hass) Stage.pics.hass = h; }
  getCardSize() { return 2; }
}


// The office group on her screen (WhatsApp, nina-live whatsapp/; the user, 2026-11-26): read only. Its
// last messages, newest at the bottom; a tap opens it large. Her panel's "whatsapp" fact (the shown
// groups' recent messages) and its live "whatsapp" events.
//
//   type: custom:nina-chat-card
//   chat: Office          # the group's name; none: the first of her settings' WhatsApp groups
//   lines: 4              # messages in the card (default 4)
class NinaChatCard extends HTMLElement {
  setConfig(c) {
    this.c = Object.assign({ chat: "", title: "", icon: "mdi:whatsapp", lines: 4, scene: "agenda", height: "" }, c || {}); // chat "": the first group of her settings
    this.panel = this.c.panel || (location.protocol === "https:" ? `https://${location.hostname}` : `http://${location.hostname}:8770`);
    if (this.root) return;
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SCHEME}
      ha-card { cursor: pointer; padding: 12px 14px; }
      .bg img { opacity: .55; transform: none; }
      .msgs { display: flex; flex-direction: column; gap: 5px; }
      .m { font-size: .9em; line-height: 1.3; } .m b { font-weight: 600; } .m .t { color: rgba(255,255,255,.55); font-size: .8em; margin-left: 6px; }
      .m.me b { color: #f0a37f; } .m.to b::after { content: " → Nina"; font-weight: 400; color: rgba(255,255,255,.55); }
      .empty { color: rgba(255,255,255,.65); font-size: .9em; }
    </style><ha-card><div class="bg"><img alt="" src="${ASSETS}scenes/${this.c.scene}/1.webp"></div><div class="body">
      <div class="head"><div class="icon"><ha-icon icon="${this.c.icon}"></ha-icon></div>
        <div><div class="title">${this.c.title || this.c.chat}</div><div class="sub">WhatsApp</div></div></div>
      <div class="msgs"><div class="empty">…</div></div></div></ha-card>`;
    if (this.c.height) this.root.querySelector("ha-card").style.minHeight = this.c.height;
    this.root.querySelector("ha-card").addEventListener("click", () => this.open());
  }
  connectedCallback() {
    if (this.listening) return;
    this.listening = true;
    fetch(`${this.panel}/api/state`).then((r) => r.json()).then((s) => this.take(s.facts?.whatsapp)).catch(() => this.say("her panel is not reachable"));
    stageStream(this.panel).addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      if (e.ev === "whatsapp") this.take(e);
      else if (e.ev === "wa_status") this.root.querySelector(".sub").textContent = `WhatsApp · ${e.state.replace("_", " ")}`;
    });
  }
  say(t) { this.root.querySelector(".msgs").innerHTML = `<div class="empty">${t}</div>`; }
  take(f) {
    if (!f) return this.say("WhatsApp is not linked yet");
    const chats = f.chats || [];
    const chat = this.c.chat ? chats.find((c) => (c.name || "").toLowerCase() === this.c.chat.toLowerCase()) : chats[0];
    const name = this.c.chat || chat?.name || "";
    this.root.querySelector(".title").textContent = this.c.title || name || "WhatsApp";
    this.msgs = chat?.messages || [];
    if (!chat?.chat) return this.say(name ? `not in a group named “${name}”` : "no group chosen (her settings: WhatsApp)");
    this.render(this.root.querySelector(".msgs"), this.msgs.slice(-this.c.lines));
    this.big?.(this.msgs);
  }
  render(el, msgs) {
    const esc = (t) => String(t || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
    if (!msgs.length) { el.innerHTML = `<div class="empty">nothing written yet</div>`; return; }
    el.innerHTML = msgs.map((m) => {
      const t = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const body = m.text ? esc(m.text) : `<i>[${esc(m.kind)}]</i>`;
      return `<div class="m${m.me ? " me" : ""}${m.to_her ? " to" : ""}"><b>${esc(m.me ? "Nina" : m.from || "someone")}</b> ${body}<span class="t">${t}</span></div>`;
    }).join("");
  }
  // large: all its recent messages, kept up to date while open
  async open() {
    const { expand } = await EXPAND;
    const el = document.createElement("div");
    el.innerHTML = `<style>.wrap { background: #14100e; color: #fff; padding: 16px 18px; font: 15px system-ui, sans-serif; }
      .h { font-weight: 600; font-size: 1.15em; margin-bottom: 10px; } .msgs { display: flex; flex-direction: column; gap: 8px; max-height: 70vh; overflow-y: auto; overflow-x: hidden; } .m { overflow-wrap: anywhere; }
      .m { line-height: 1.35; } .m b { font-weight: 600; } .m .t { color: rgba(255,255,255,.5); font-size: .8em; margin-left: 6px; }
      .m.me b { color: #f0a37f; } .m.to b::after { content: " → Nina"; font-weight: 400; color: rgba(255,255,255,.5); } .empty { color: rgba(255,255,255,.6); }</style>
      <div class="wrap"><div class="h">${this.root.querySelector(".title").textContent} · WhatsApp</div><div class="msgs"></div></div>`;
    const box = el.querySelector(".msgs");
    this.big = (msgs) => { this.render(box, msgs || []); box.scrollTop = box.scrollHeight; };
    this.big(this.msgs);
    const close = expand(el);
    const was = close;
    this.closeBig = () => { this.big = null; was?.(); };
  }
  set hass(h) {}
  getCardSize() { return 3; }
}

// ---- activity ---------------------------------------------------------------------------------
const TOOL_WORDS = { home_timers: "a timer", home_music: "the music", home_glow: "the bedroom light", home_lights: "the lights",
  home_air: "the air", home_comfort: "the air", home_agenda: "the agenda", calendar: "the calendar", lists: "the lists",
  weather: "the weather", web_search: "the web", narrate: "herself", home_persona: "her mood", home_habits: "a habit",
  home_scenes: "a scene", delegate: "a task", screen: "the screen" };
class NinaActivityCard extends NinaBase {
  setConfig(c) {
    this.c = c || {};
    if (this.root) return;
    const el = this.frame(this.c.scene || "habits", 2, "mdi:timeline-clock", "What Nina did", "her tools, her moods, who came by");
    el.innerHTML = `<div class="list"></div>`;
    if (this.c.list_height) this.root.querySelector("ha-card").style.setProperty("--list-height", this.c.list_height);
    const render = (items) => {
      const list = this.root.querySelector(".list");
      let lastArt = "";
      const rows = [];
      for (const e of items) {
        const t = new Date(e.at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        let what = null;
        if (e.ev === "tool") what = [`${TOOL_WORDS[e.name] || e.name.replace(/^home_/, "")}`, e.result?.text || ""];
        else if (e.ev === "persona") { if (e.artwork !== lastArt) { what = [`her mood: ${e.mood}`, `as ${e.artwork}${e.override ? ", held" : ""}${e.moon ? ", " + e.moon : ""}`]; lastArt = e.artwork; } }
        else if (e.ev === "presence") what = [e.kind === "left" ? "nobody at the screen" : e.kind === "near" ? "someone at the screen" : "someone in the room", e.distance ? `${(+e.distance).toFixed(1)} m` : ""];
        else if (e.ev === "surprises" && e.unseen) what = ["a surprise", `${e.unseen} new, ${e.open} open`];
        if (what) rows.push(`<div class="item"><div class="when">${t}</div><div class="what"><b>${what[0]}</b><div>${what[1]}</div></div></div>`);
      }
      list.innerHTML = rows.reverse().slice(0, this.c.max || 30).join("") || `<div class="empty">Nothing yet.</div>`;
    };
    const scenes = fetch(`${ASSETS}scenes/scenes.json`).then((r) => r.json()).catch(() => null);
    const follow = async (items) => { // the background: the scene of the newest thing she did
      const sc = await scenes;
      if (!sc) return;
      for (const e of [...items].reverse()) {
        const name = e.ev === "tool" ? sc.tools[e.name] : e.ev === "surprises" && e.unseen ? "surprise" : e.ev === "persona" ? "fortune" : null;
        if (name) return this.scene(name, sc.frames[name]);
      }
    };
    const load = () => api("/api/recent").then((items) => { render(items); follow(items); }).catch(() => (this.root.querySelector(".list").innerHTML = `<div class="empty">Her panel is not reachable.</div>`));
    load();
    this.timer = setInterval(load, 15000);
  }
}

// ---- surprises --------------------------------------------------------------------------------
class NinaSurprisesCard extends NinaBase {
  setConfig(c) {
    this.c = c || {};
    if (this.root) return;
    const el = this.frame("surprise", 1, "mdi:flag", "Surprises", "where her rules did not expect what happened");
    el.innerHTML = `<div class="list"></div><div class="row"><button class="ask">Tell me about them</button><span class="note">She says it aloud.</span></div>`;
    if (this.c.list_height) this.root.querySelector("ha-card").style.setProperty("--list-height", this.c.list_height);
    this.root.querySelector(".ask").addEventListener("click", () => api("/api/do", { action: "type", arg: "What surprised you?" }).catch(() => {}));
    const files = (dir) => fetch(`${PANEL}/metis/${dir}/`).then((r) => (r.ok ? r.text() : "")).then((h) => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
    const load = async () => {
      const list = this.root.querySelector(".list");
      try {
        const names = await files("surprises");
        const ids = names.filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, ""));
        const taken = new Set(names.filter((n) => n.endsWith(".taken")).map((n) => n.replace(/\.taken$/, "")));
        const ruled = new Set((await files("rulings")).filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, "")));
        const rows = [];
        for (const id of ids.sort().reverse().slice(0, 25)) {
          const s = await fetch(`${PANEL}/metis/surprises/${id}.json`).then((r) => r.json()).catch(() => null);
          if (!s) continue;
          const st = ruled.has(id) ? "ruled" : taken.has(id) ? "taken" : "open";
          const why = s.words || s.reading?.why || s.reading?.kind || JSON.stringify(s.reading || {}).slice(0, 120);
          const t = new Date(s.ts).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
          rows.push(`<div class="item"><div class="when">${t}</div><div class="what"><b>${s.member}</b><span class="pill ${st}">${st}</span><div>${why}</div></div></div>`);
        }
        list.innerHTML = rows.join("") || `<div class="empty">Nothing has surprised her: every rule did what it expected.</div>`;
      } catch (e) { list.innerHTML = `<div class="empty">Her panel is not reachable.</div>`; }
    };
    load();
    this.timer = setInterval(load, 30000);
  }
}

// ---- WhatsApp: her linked device and the groups on her screen (2026-11-26) ---------------------
// Linked or not, connected, the number; Link a device (a QR from her panel, scanned on the phone:
// Linked devices → Link a device), Unlink (asked twice); the groups she is in, ticked for her screen
// (the first ticked: the WhatsApp card's); how she answers is her config's (whatsapp.answer), shown
// only: on a person's own number she must never start answering their contacts from a screen.
class NinaWhatsAppCard extends NinaBase {
  get style() { // the shadow root's own rules (a getter: HTMLElement.style is the host's inline style)
    return `
      .st { font-size: .95em; margin: 4px 0 8px; } .st b { font-weight: 600; }
      .qr { display: none; text-align: center; margin: 8px 0; } .qr img { width: 240px; height: 240px; background: #fff; padding: 10px; border-radius: 12px; }
      .groups { max-height: var(--gh, 220px); overflow: auto; background: rgba(0,0,0,.35); border-radius: 10px; padding: 6px 10px; }
      .g { display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 3px 0; font-size: .92em; cursor: pointer; width: auto; color: #fff; }
      .g input { flex: none; width: 16px; height: 16px; min-width: 0; margin: 0; padding: 0; accent-color: #d97757; }
      .g span { flex: 1; text-align: left; }
      .filter { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
      .danger { background: #a3402a; }`;
  }
  setConfig(c) {
    this.c = c || {};
    if (this.root) return;
    const el = this.frame("agenda", 2, "mdi:whatsapp", "WhatsApp", "her linked device and the groups on her screen");
    el.innerHTML = `
      <div class="st">…</div>
      <div class="row acts"><button class="link">Link a device</button><button class="ghost unlink">Unlink</button><button class="danger sure" style="display:none">Unlink: sure?</button><span class="note msg"></span></div>
      <div class="qr"><img alt="QR code to scan"><div class="note qrn"></div></div>
      <div class="gsec">
        <div class="row"><label>On her screen</label><input class="filter" placeholder="find a group"></div>
        <div class="groups"></div>
        <div class="row"><button class="save">Save</button><button class="ghost refresh">Read her groups again</button><span class="note gmsg"></span></div>
        <div class="note">Ticked groups appear on her WhatsApp card (the first ticked is the card's) and are kept. How she answers is set in her config: <span class="mode"></span>.</div>
      </div>`;
    if (this.c.expanded) this.root.querySelector(".groups").style.setProperty("--gh", this.c.list_height || "50vh");
    const q = (x) => this.root.querySelector(x);
    q(".link").addEventListener("click", () => this.act("whatsapp_link", "waiting for the code…"));
    q(".unlink").addEventListener("click", () => { q(".sure").style.display = ""; setTimeout(() => (q(".sure").style.display = "none"), 6000); });
    q(".sure").addEventListener("click", () => { q(".sure").style.display = "none"; this.act("whatsapp_unlink", "unlinking…"); });
    q(".refresh").addEventListener("click", () => this.act("whatsapp_refresh", "reading…", ".gmsg"));
    q(".filter").addEventListener("input", () => this.list());
    q(".save").addEventListener("click", async () => {
      const r = await api("/api/do", { action: "whatsapp_show", arg: this.ticked().join(", ") });
      q(".gmsg").textContent = r.error ? "not saved: " + r.error : "saved";
      setTimeout(() => (q(".gmsg").textContent = ""), 3000);
    });
  }
  connectedCallback() {
    if (this.listening) return;
    this.listening = true;
    api("/api/state").then((s) => this.take(s.facts?.settings)).catch(() => (this.root.querySelector(".st").textContent = "her panel is not reachable"));
    stageStream(PANEL).addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      if (e.ev === "settings") this.take(e);
      else if (e.ev === "wa_status") this.status(e);
    });
  }
  async act(action, wait, where = ".msg") {
    const q = (x) => this.root.querySelector(x);
    q(where).textContent = wait;
    const r = await api("/api/do", { action });
    q(where).textContent = r.error ? r.error : "";
  }
  take(st) {
    if (!st) return;
    const w = st.whatsapp, q = (x) => this.root.querySelector(x);
    if (!w) { q(".st").textContent = "WhatsApp is not enabled in her config (whatsapp.enabled)"; q(".acts").style.display = q(".gsec").style.display = "none"; return; }
    this.w = w;
    if (!this.chosen || !this.dirty) this.chosen = (st.whatsapp_show || w.show || []).slice();
    const who = w.linked ? `linked${w.name ? " as <b></b>" : ""}${w.number ? ` · number ending ${String(w.number).slice(-4)}` : ""} · ${w.connected ? "connected" : "not connected"}` : "not linked";
    q(".st").innerHTML = who; if (w.name) q(".st b").textContent = w.name;
    q(".link").style.display = w.linked ? "none" : ""; q(".unlink").style.display = w.linked ? "" : "none";
    q(".gsec").style.display = w.linked ? "" : "none";
    q(".mode").textContent = { named: "named (direct messages, and groups that name her)", self: "self (only the number's own \"Message yourself\" chat)", none: "none (reads only)" }[w.answer] || w.answer;
    if (w.linked) q(".qr").style.display = "none";
    this.list();
  }
  status(e) {
    const q = (x) => this.root.querySelector(x);
    if (e.state === "qr" && e.png) {
      q(".qr").style.display = ""; q(".qr img").src = e.png;
      q(".qrn").textContent = `On the phone: WhatsApp → Settings → Linked devices → Link a device, and scan (code ${e.n}; a new one every ~20 s).`;
      q(".msg").textContent = "";
    } else if (e.state === "linked") { q(".qr").style.display = "none"; q(".msg").textContent = "linked"; }
    else if (e.state === "link_ended") { q(".qr").style.display = "none"; q(".msg").textContent = "not linked (" + (e.reason || "ended") + "): try again"; }
    else if (e.state === "logged_out") { q(".msg").textContent = "unlinked"; }
  }
  ticked() { return this.chosen || []; }
  list() {
    const box = this.root.querySelector(".groups"), f = this.root.querySelector(".filter").value.toLowerCase();
    const all = [...new Set([...(this.chosen || []), ...(this.w?.groups || [])])];
    box.replaceChildren();
    if (!all.length) { box.textContent = "in no group yet: add her number to one, then read her groups again"; return; }
    for (const name of all) {
      if (f && !name.toLowerCase().includes(f)) continue;
      const lab = document.createElement("label"); lab.className = "g";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = this.chosen.includes(name);
      cb.addEventListener("change", () => {
        this.dirty = true;
        this.chosen = cb.checked ? [...this.chosen, name] : this.chosen.filter((x) => x !== name);
      });
      const t = document.createElement("span"); t.textContent = name + (this.chosen[0] === name ? "  (her card's)" : "");
      lab.append(cb, t); box.appendChild(lab);
    }
  }
}

customElements.define("nina-settings-card", NinaSettingsCard);
customElements.define("nina-activity-card", NinaActivityCard);
customElements.define("nina-surprises-card", NinaSurprisesCard);
customElements.define("nina-bubble-card", NinaBubbleCard);
customElements.define("nina-photos-card", NinaPhotosCard);
customElements.define("nina-video-card", NinaVideoCard);
customElements.define("nina-stage-card", NinaStageCard);
customElements.define("nina-media-card", NinaMediaCard);
customElements.define("nina-chat-card", NinaChatCard);
customElements.define("nina-whatsapp-card", NinaWhatsAppCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: "nina-settings-card", name: "Nina: settings", description: "Her name, persona, voice and temperament." },
  { type: "nina-activity-card", name: "Nina: activity", description: "What she did lately." },
  { type: "nina-surprises-card", name: "Nina: surprises", description: "The loop workspace's surprises." },
  { type: "nina-whatsapp-card", name: "Nina: WhatsApp", description: "Her linked device (link by QR, unlink) and the groups on her screen." });
