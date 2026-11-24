// Nina's card (acasa ha-ui, 2026-11-24): Nina herself on the dashboard. Her state from her panel
// (fsttm-live's web plugin, :8770): awake or asleep, listening, thinking, speaking, the floor; the
// mic and her voice, on and off (POST /api/prefs); the conversation as it happens (the event
// stream), as chat bubbles. The bubbles take assist-chat-display's theme variables, so one theme
// styles both. Config: panel (default: this host, port 8770), max_messages (20), message_max_age
// (s, 300; 0 keeps them).
class NinaCard extends HTMLElement {
  setConfig(c) {
    this.c = Object.assign({ max_messages: 20, message_max_age: 300 }, c || {});
    this.panel = this.c.panel || `${location.protocol}//${location.hostname}:8770`;
    if (!this.root) {
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `
<style>
  :host { display: block; }
  ha-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box; }
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
</style>
<ha-card>
  <div class="top"><div class="orb asleep"></div>
    <div class="who"><div class="name">Nina</div><div class="state">…</div></div>
    <div class="toggles"><button data-p="mic">mic</button><button data-p="voice">voice</button></div></div>
  <div class="chat"></div>
</ha-card>`;
      this.root.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => this.toggle(b.dataset.p)));
      this.connect();
      setInterval(() => this.age(), 5000);
    }
  }
  set hass(h) { this._hass = h; }
  getCardSize() { return 5; }
  async api(path, body) {
    const r = await fetch(this.panel + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    return r.json();
  }
  async toggle(p) {
    const on = !this.prefs?.[p];
    try { const s = await this.api("/api/prefs", { [p]: on }); this.prefs = Object.assign(this.prefs || {}, { [p]: on }); this.showPrefs(); } catch (e) { this.state("her panel is not reachable"); }
  }
  showPrefs() {
    this.root.querySelectorAll("button").forEach((b) => b.classList.toggle("on", !!this.prefs?.[b.dataset.p]));
  }
  state(t) { this.root.querySelector(".state").textContent = t; }
  status(s) {
    const orb = this.root.querySelector(".orb");
    orb.className = "orb" + (s.awake ? "" : " asleep") + (s.hearing ? " hearing" : "") + (s.speaking ? " speaking" : "");
    this.state(!s.mind && !s.awake ? "asleep" : s.speaking ? "speaking" : s.replying ? "thinking" : s.hearing ? "listening" : s.awake ? "here" : "asleep");
  }
  msg(cls, text) {
    if (!text || !text.trim()) return null;
    const chat = this.root.querySelector(".chat");
    const b = document.createElement("div");
    b.className = "b " + cls; b.textContent = text.trim(); b.dataset.t = Date.now();
    chat.appendChild(b);
    while (chat.children.length > this.c.max_messages) chat.firstChild.remove();
    chat.scrollTop = chat.scrollHeight;
    return b;
  }
  age() {
    const max = this.c.message_max_age * 1000;
    if (!max) return;
    this.root.querySelectorAll(".b").forEach((b) => { if (Date.now() - b.dataset.t > max) b.remove(); });
  }
  connect() {
    this.api("/api/state").then((s) => { this.prefs = s.prefs; this.showPrefs(); this.status(s.status); }).catch(() => this.state("her panel is not reachable"));
    const es = new EventSource(this.panel + "/api/events");
    let said = "", nina = null;
    es.addEventListener("status", (m) => this.status(JSON.parse(m.data)));
    es.addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      switch (e.ev) {
        case "typed": this.msg("user", e.text); break;
        case "turn":
          if (e.note) this.msg("note", e.text.replace(/^NOTE \((\w+)\): /, ""));
          else if (!e.typed_shown) this.msg("user", e.text.replace(/^\(You were interrupted[^)]*\)\n/, ""));
          nina = null; said = ""; break;
        case "said": said += e.text; if (!nina) nina = this.msg("nina", " "); if (nina) nina.textContent = said.trim(); break;
        case "reply_done":
          if (!nina && e.said) this.msg("nina", e.said); else if (nina) nina.textContent = e.said || said.trim();
          nina = null; said = ""; break;
        case "prefs": this.prefs = e.prefs; this.showPrefs(); break;
      }
    });
    es.onerror = () => { es.close(); this.state("reconnecting to her…"); setTimeout(() => this.connect(), 5000); };
  }
}
customElements.define("nina-card", NinaCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "nina-card", name: "Nina", description: "Nina: her state, the mic and her voice, the conversation." });
