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
//
// Depth parallax (parallax: true, the default): with WebGL, one shader draws the frames with their
// crossfade weights and shifts each pixel by the persona's depth map (Depth Anything, made once:
// nina-live design/tools/depth.py) along a slow drift, so her head seems to turn a little. It
// measures itself: under 20 frames a second for three seconds (a Pi whose Firefox has no GPU), it
// gives way to the CSS version. 30 frames a second at most, none while the page is hidden.
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
  connectedCallback() { hub.cards.add(this); if (this.root) this.render(); this.animate(true); this.gl?.start(); }
  disconnectedCallback() { hub.cards.delete(this); this.animate(false); this.gl?.stop(); }
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
    this.depth = new Image(); this.depth.src = `${dir}/depth.webp`;
    this.frames.neutral.onload = () => { this.root.querySelector(".face").hidden = false; this.root.querySelector(".credit").hidden = false; };
    this.target = {};
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
    const stop = () => { cancelAnimationFrame(this.raf); this.raf = null; };
    const fallback = (why) => { stop(); cv.remove(); rig.classList.remove("gl"); this.gl = null; console.info("nina-card: parallax off:", why); };
    const draw = (now) => {
      this.raf = requestAnimationFrame(draw);
      const dt = now - last;
      if (dt < 31) return; // 30 frames a second at most
      last = now; frames++;
      if (frames > 5 && now - t0 < 6000) { slow = dt > 50 ? slow + dt : Math.max(0, slow - dt); if (slow > 3000) return fallback("too slow (" + Math.round(dt) + " ms a frame)"); }
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
      const tx = amp * Math.sin(s * sp * 2 * Math.PI / 9) + (cl.contains("lean") ? .02 : 0), ty = amp * .5 * Math.sin(s * sp * 2 * Math.PI / 13 + 1);
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
