// Nina's view (acasa ha-ui, 2026-11-24): the kiosk dashboard follows what Nina does. Each tool
// call of hers (her panel's event stream: GET :8770/api/events, event "tool") brings up the page
// that shows it (views.json: the tool, or its intent, to a view); after a while without another,
// the dashboard goes back home. Only on Nina's dashboards (nina-panel; nina-side, the right half of
// Nina's own screen, shell.html): no other page is ever moved (Home Assistant's own, for editing).
(async () => {
  // loaded twice on Nina's dashboards (a dashboard resource, and frontend.extra_module_url for every
  // page: Home Assistant's own pages load no dashboard resources): once is enough
  if (window.__ninaView) return;
  window.__ninaView = true;
  const v = new URL(import.meta.url).searchParams.get("v") || "0";
  const conf = await fetch(`/local/nina/views.json?v=${v}`).then((r) => r.json()).catch(() => ({}));
  const bases = [conf.dashboard || "nina-panel", ...(conf.also || ["nina-side"])].map((d) => `/${d}/`);
  const home = conf.home || "home";
  const back = (conf.return_after || 90) * 1000;
  const tools = conf.tools || {};
  const panel = conf.panel || `${location.protocol}//${location.hostname}:8770`;
  let timer;
  const go = (view) => {
    const base = bases.find((b) => location.pathname.startsWith(b));
    if (!base) return;
    const path = base + view + location.search;
    if (location.pathname + location.search !== path) {
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    }
    clearTimeout(timer);
    if (view !== home) timer = setTimeout(() => go(home), back);
  };
  const viewOf = (e) => {
    const t = tools[e.name];
    if (!t) return null;
    if (typeof t === "string") return t;
    return t[(e.args || {}).intent] || t["*"] || null;
  };
  const connect = () => {
    const es = new EventSource(`${panel}/api/events`);
    es.addEventListener("ev", (m) => {
      const e = JSON.parse(m.data);
      if (e.ev === "tool") {
        const view = viewOf(e);
        if (view) go(view);
      }
    });
    es.onerror = () => {
      es.close();
      setTimeout(connect, 5000);
    };
  };
  connect();

  // the way back: on a kiosk (a browser that opened Nina's dashboard with ?kiosk), any other Home
  // Assistant page (its full interface, opened by her card's ⌂) gets a floating Nina button. Not in
  // Nina's own screen's frame (it has its own), not in a desktop browser.
  const KIOSK = "nina-kiosk";
  const mine = () => bases.some((b) => location.pathname.startsWith(b));
  const framed = window.top !== window;
  const pill = document.createElement("button");
  pill.textContent = "Nina";
  pill.title = "Back to Nina";
  Object.assign(pill.style, { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "12px", zIndex: 9999, // Home Assistant's own buttons are in the corners display: "none",
    alignItems: "center", gap: "8px", border: "0", borderRadius: "999px", padding: "10px 16px 10px 12px",
    background: "#d97757", color: "#fff", font: "500 15px system-ui, sans-serif", cursor: "pointer",
    boxShadow: "0 1px 6px rgba(0,0,0,.45)" });
  const dot = document.createElement("span");
  Object.assign(dot.style, { width: "22px", height: "22px", borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ffd9a8, #c96f2e)" });
  pill.prepend(dot);
  pill.addEventListener("click", () => { location.href = `${bases[0]}${home}?kiosk`; });
  document.body.appendChild(pill);
  const place = () => {
    const k = new URLSearchParams(location.search).get("kiosk");
    if (k === "off") localStorage.removeItem(KIOSK); // ?kiosk=off on any page: this browser is not a kiosk
    else if (mine() && k !== null) localStorage.setItem(KIOSK, "1");
    const hers = location.pathname.startsWith("/home-panel/"); // the full mode's Home: her card is there
    pill.style.display = !framed && !mine() && !hers && localStorage.getItem(KIOSK) === "1" ? "flex" : "none";
  };
  place();
  window.addEventListener("location-changed", place);
  window.addEventListener("popstate", place);
  setInterval(place, 2000); // Home Assistant's own navigation does not always say so
})();
