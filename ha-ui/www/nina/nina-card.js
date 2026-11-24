// Nina's card (acasa ha-ui, 2026-11-24): Nina herself on the dashboard. Her state from her panel
// (fsttm-live's web plugin, :8770): awake or asleep, listening, thinking, speaking, the floor; the
// mic and her voice, on and off (POST /api/prefs); the conversation as it happens (the event
// stream), as chat bubbles. The bubbles take assist-chat-display's theme variables, so one theme
// styles both. Config: panel (default: this host, port 8770), max_messages (20), message_max_age
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
const ASSETS = new URL(".", import.meta.url).pathname;

const hub = window.__ninaHub || (window.__ninaHub = {
  msgs: [], status: null, prefs: null, cards: new Set(), started: false, said: "", nina: null, panel: null,
  persona: null, // Nina's persona now (her temperament: the panel's persona events)
  surprises: null, // {unseen, open}: surprises she has not told about; the domains' records still open
  talkUntil: 0, // with her voice off: her face "speaks" her text reply until then (as long as saying it would take)
  quietTalk(text) { if (this.prefs && this.prefs.voice === false && text) this.talkUntil = Math.max(this.talkUntil, Date.now() + Math.min(20000, 600 + text.length * 65)); },
  emit() { this.cards.forEach((c) => c.render()); },
  viewer: null, // {angle, distance, elevation, at}: where the person is (the radar's reading)
  look(v) { this.viewer = Object.assign({}, v, { at: Date.now() }); },
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
      fetch(panel + "/api/state").then((r) => r.json()).then((s) => { this.prefs = s.prefs; this.status = s.status; this.persona = s.facts?.persona?.artwork || this.persona; this.surprises = s.facts?.surprises || this.surprises; this.emit(); })
        .catch(() => { this.status = null; this.emit(); });
      const es = new EventSource(panel + "/api/events");
      es.addEventListener("status", (m) => { this.status = JSON.parse(m.data); this.emit(); });
      es.addEventListener("ev", (m) => {
        const e = JSON.parse(m.data);
        switch (e.ev) {
          case "typed": this.add("user", e.text); break;
          case "turn":
            if (e.note) this.add("note", e.text.replace(/^NOTE \((\w+)\): /, ""));
            else if (/^SAY: /.test(e.text)) { /* Nina's own words handed to her voice (a narration): shown as her reply, not as the person's */ }
            else if (!e.typed_shown) {
              const t = e.text.replace(/^\(You were interrupted[^)]*\)\n/, "").trim(), last = this.msgs[this.msgs.length - 1];
              if (!(last && last.cls === "user" && last.text === t && Date.now() - last.t < 5000)) this.add("user", t); // a typed line: shown already
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
          case "persona": if (e.artwork && e.artwork !== this.persona) { this.persona = e.artwork; this.emit(); } break;
          case "surprises": this.surprises = { unseen: e.unseen || 0, open: e.open || 0 }; this.emit(); break;
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
  .rig.gl { animation: none; rotate: none; }
  .rig.gl img { display: none; }
  .rig canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
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
  .note { align-self: center; background: transparent; color: var(--secondary-text-color); font-style: italic; font-size: .9em; }
  .off { color: var(--secondary-text-color); font-size: .85em; text-align: center; }
  .hint { margin: auto; color: var(--secondary-text-color); text-align: center; line-height: 1.6; opacity: .8; }
  .chat:not(:empty) + .hint { display: none; }
</style>
<ha-card>
  <div class="face" hidden><div class="rig"></div></div>
  <div class="top"><div class="orb asleep"></div>
    <div class="who"><div class="name">Nina <span class="flag" hidden></span></div><div class="state">…</div></div>
    <div class="toggles"><button data-p="mic">mic</button><button data-p="voice">voice</button><button class="ha" title="Home Assistant: add and configure devices">⌂</button></div></div>
  <div class="chat"></div>
  <div class="hint">Say “Nina”, or tap the mic.</div>
  <div class="credit" hidden>Claudia by anabology · AI-generated</div>
</ha-card>`;
      setTimeout(() => this.face(), 0); // after Home Assistant gives the card its states (her persona)
      if (this.c.height) this.root.querySelector("ha-card").style.height = this.c.height;
      this.root.querySelectorAll("button[data-p]").forEach((b) =>
        b.addEventListener("click", () => this.toggle(b.dataset.p)));
      // ⌂: Home Assistant's full interface (on Nina's own screen its mode; on a Home Assistant
      // dashboard, its default dashboard, the sidebar there leads back to hers)
      // ⚑: what surprised her (asked as if typed: she answers with the explain tool's SURPRISES)
      this.root.querySelector(".flag").addEventListener("click", () =>
        this.api("/api/do", { action: "type", arg: "What surprised you?" }).catch(() => {}));
      this.root.querySelector("button.ha").addEventListener("click", () =>
        window.__ninaShell ? window.__ninaShell.mode("ha") : (location.href = "/"));
      hub.start(this.panel);
      setInterval(() => this.render(), 5000);
    }
  }
  connectedCallback() { hub.cards.add(this); if (this.root) this.render(); this.animate(true); this.gl?.start(); }
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
      const every = busy ? 33 : 66; // 30 or 15 frames a second
      next(every);
      const dt = now - last;
      last = now; frames++;
      if (frames > 5 && now - t0 < 6000) { slow = dt > every + 50 ? slow + dt : Math.max(0, slow - dt); if (slow > 3000) return fallback("too slow (" + Math.round(dt) + " ms a frame)"); }
      if (asleep && Object.keys(w).every((n) => Math.abs((this.target[n] || 0) - w[n]) < .01)) { // settled: rest until she wakes
        if (++this.still > 8) { stop(); return; }
      } else this.still = 0;
      const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
      if (this.frames) { this.show("blink", true); const rig = this.root.querySelector(".rig"); rig.classList.add("slow"); rig.classList.remove("fast", "lean"); }
    }
    const max = this.c.message_max_age * 1000;
    const msgs = hub.msgs.filter((m) => !max || Date.now() - m.t <= max).slice(-this.c.max_messages);
    const chat = this.root.querySelector(".chat");
    chat.replaceChildren(...msgs.map((m) => { const b = document.createElement("div"); b.className = "b " + m.cls; b.textContent = m.text; return b; }));
    chat.scrollTop = chat.scrollHeight;
  }
  set hass(h) {
    this._hass = h;
    const ve = h?.states?.[this.c.viewer || "sensor.nina_viewer"];
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
    return r.json();
  }
  async toggle(p) {
    const on = !hub.prefs?.[p];
    try { await this.api("/api/prefs", { [p]: on }); hub.prefs = Object.assign(hub.prefs || {}, { [p]: on }); hub.emit(); } catch (e) { this.state("her panel is not reachable"); }
  }
  showPrefs() {
    this.root.querySelectorAll("button[data-p]").forEach((b) => b.classList.toggle("on", !!hub.prefs?.[b.dataset.p]));
  }
  state(t) { this.root.querySelector(".state").textContent = t; }
  status(s) {
    const orb = this.root.querySelector(".orb");
    orb.className = "orb" + (s.awake ? "" : " asleep") + (s.hearing ? " hearing" : "") + (s.speaking ? " speaking" : "");
    if (this.frames) {
      const asleep = !s.mind && !s.awake;
      if (!asleep && this.isConnected && !document.hidden) this.gl?.start(); // drawing rests while she sleeps
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
