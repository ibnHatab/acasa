// Nina's view (acasa ha-ui, 2026-11-24): the kiosk dashboard follows what Nina does. Each tool
// call of hers (her panel's event stream: GET :8770/api/events, event "tool") brings up the page
// that shows it (views.json: the tool, or its intent, to a view); after a while without another,
// the dashboard goes back home. Only on Nina's dashboard: no other page is ever moved.
(async () => {
  const v = new URL(import.meta.url).searchParams.get("v") || "0";
  const conf = await fetch(`/local/nina/views.json?v=${v}`).then((r) => r.json()).catch(() => ({}));
  const base = `/${conf.dashboard || "nina-panel"}/`;
  const home = conf.home || "home";
  const back = (conf.return_after || 90) * 1000;
  const tools = conf.tools || {};
  const panel = conf.panel || `${location.protocol}//${location.hostname}:8770`;
  let timer;
  const go = (view) => {
    if (!location.pathname.startsWith(base)) return;
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
})();
