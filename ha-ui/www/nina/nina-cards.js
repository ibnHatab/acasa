// Nina's cards for Home Assistant (acasa ha-ui, 2026-11-25; the user: a Nina card in Home Assistant's
// full mode, her settings and her activities, and a card of their own for the surprises, in either
// mode). All talk to her panel (:8770; CORS for Home Assistant's origin) and wear her card scheme:
// a Codex scene as the background, the controls on it.
//
//   type: custom:nina-settings-card     her name, persona (automatic or pinned), voice, the temperament's tuning
//   type: custom:nina-activity-card     what she did lately: her tools, her moods, who came by, surprises
//   type: custom:nina-surprises-card    the loop workspace's surprises: open, taken, ruled (panel /metis/)
const EXPAND = import(new URL(`nina-expand.js?v=m${Math.floor(Date.now() / 60000)}`, import.meta.url)); // a card opened large (its own version: fresh each minute, like nina-boot's)
const ASSETS = new URL(".", import.meta.url).pathname;
const PANEL = `${location.protocol}//${location.hostname}:8770`;
const api = (path, body) => fetch(PANEL + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());

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

// ---- activity ---------------------------------------------------------------------------------
const TOOL_WORDS = { home_timers: "a timer", home_music: "the music", home_glow: "the bedroom light", home_lights: "the lights",
  home_air: "the air", home_comfort: "the air", home_agenda: "the agenda", calendar: "the calendar", lists: "the lists",
  weather: "the weather", web_search: "the web", narrate: "herself", home_persona: "her mood", home_habits: "a habit",
  home_scenes: "a scene", delegate: "a task" };
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

customElements.define("nina-settings-card", NinaSettingsCard);
customElements.define("nina-activity-card", NinaActivityCard);
customElements.define("nina-surprises-card", NinaSurprisesCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: "nina-settings-card", name: "Nina: settings", description: "Her name, persona, voice and temperament." },
  { type: "nina-activity-card", name: "Nina: activity", description: "What she did lately." },
  { type: "nina-surprises-card", name: "Nina: surprises", description: "The loop workspace's surprises." });
