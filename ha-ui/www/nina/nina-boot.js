// nina-boot.js (acasa ha-ui, 2026-11-24): Home Assistant's frontend.extra_module_url, on every page.
// It never changes (that URL has no version, so the browser keeps it); it loads nina-view.js fresh
// (a new ?v= each minute), so a changed view reaches the kiosk without anyone clearing a cache.
import(`/local/nina/nina-view.js?v=b${Math.floor(Date.now() / 60000)}`);
