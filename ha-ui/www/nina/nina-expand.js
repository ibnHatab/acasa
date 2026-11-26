// expand: a card opened large over the page (acasa ha-ui, 2026-11-25; the user: every decorative
// button, a single click expands to its card; Nina's too). One overlay at a time: the backdrop, ✕ or
// Escape closes it; actions are extra buttons in its corner (Nina's: her own screen). The card gets
// Home Assistant's states while it is open.
const ha = () => document.querySelector("home-assistant")?.hass;
// inside Home Assistant's own tree (home-assistant-main): its cards take their translations and the
// rest from there (Lit contexts); on document.body they render nothing
const mount = () => document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot || document.body;

export function expand(el, { actions = [] } = {}) {
  const host = mount();
  host.querySelector("#nina-expand")?.remove();
  const o = document.createElement("div");
  o.id = "nina-expand";
  if (/Firefox\//.test(navigator.userAgent)) o.classList.add("gecko");
  o.innerHTML = `<style>
    #nina-expand { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center;
                   background: rgba(8,6,5,.62); backdrop-filter: blur(6px); opacity: 0; transition: opacity .25s ease; }
    #nina-expand.on { opacity: 1; }
    #nina-expand.gecko { backdrop-filter: none; background: rgba(8,6,5,.86); } /* Firefox: blurred layers under it were painted over it */
    #nina-expand .wrap { display: flex; flex-direction: column; gap: 8px; width: min(94vw, 680px); }
    #nina-expand .box { position: relative; width: 100%; max-height: calc(94vh - 42px); overflow: auto; border-radius: 18px;
                        box-shadow: 0 12px 48px rgba(0,0,0,.6); transform: scale(.92); transition: transform .3s cubic-bezier(.2,.9,.3,1.2); }
    #nina-expand.on .box { transform: scale(1); }
    #nina-expand .bar { display: flex; justify-content: flex-end; gap: 8px; } /* above the card: none of its buttons covered */
    #nina-expand .bar button { border: 0; border-radius: 999px; height: 34px; min-width: 34px; padding: 0 12px; cursor: pointer;
                               background: rgba(0,0,0,.55); color: #fff; font: 500 14px system-ui, sans-serif; }
    #nina-expand .bar button.go { background: #d97757; }
  </style><div class="wrap"><div class="bar"></div><div class="box"></div></div>`;
  const box = o.querySelector(".box"), bar = o.querySelector(".bar");
  for (const a of actions) {
    const b = document.createElement("button");
    b.className = "go"; b.textContent = a.label;
    b.addEventListener("click", () => { close(); a.run(); });
    bar.appendChild(b);
  }
  const x = document.createElement("button");
  x.textContent = "✕"; x.title = "Close";
  bar.appendChild(x);
  box.appendChild(el);
  let last;
  const feed = () => { const h = ha(); if (h && h !== last) { last = h; el.hass = h; } };
  feed();
  const t = setInterval(feed, 1000);
  const key = (e) => e.key === "Escape" && close();
  function close() {
    clearInterval(t);
    document.removeEventListener("keydown", key);
    o.classList.remove("on");
    setTimeout(() => o.remove(), 260);
  }
  x.addEventListener("click", close);
  o.addEventListener("click", (e) => (e.target === o || e.target === o.querySelector(".wrap")) && close());
  document.addEventListener("keydown", key);
  host.appendChild(o);
  requestAnimationFrame(() => o.classList.add("on"));
  return close;
}

// a custom card made from its config, for expand
export function card(type, conf) {
  const el = document.createElement(type);
  el.setConfig(conf);
  return el;
}
