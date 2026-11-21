// home.js — acasa's device tiles, where the worlds' map.js stands (the same face: load, delta, map, showTask, entries).
// The map file (home.json, served as world/map.json) names the devices and carries the world card; the host's
// world/delta frames carry what the home believes: {devices: {id: {on, up}}, backend}. A tile is a button: it says
// the command that flips it ("turn on the light"), as typing it would. No rule lives here.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GLYPH = { light: '☀', tv: '▭', vent: '❋' };

export class HomeMap {
  constructor(el, { say } = {}) {
    this.el = el; this.say = say || (() => {}); this.map = null; this.state = {}; this.backend = null;
  }
  async load(url) {
    this.map = await (await fetch(url, { cache: 'no-store' })).json();
    this.draw();
    return this.map;
  }
  delta(f) {
    if (!f.devices) return;
    const next = { ...this.state, ...f.devices }, key = JSON.stringify([next, f.backend ?? this.backend]);
    this.state = next; this.backend = f.backend ?? this.backend;
    if (key !== this.drawn) { this.drawn = key; this.draw(); }     // the host says the devices every beat: redraw on a change only (a tile under the pointer stays)
  }
  entries() { return (this.map?.devices || []).map(d => ({ ...d, ...(this.state[d.id] || {}) })); }
  showTask() {}
  draw() {
    const devs = this.entries();
    this.el.innerHTML = `<div class="hm-grid">${devs.map(d => {
      const known = d.on !== undefined, cls = !known ? 'unknown' : d.up === false ? 'down' : d.on ? 'on' : 'off';
      const word = !known ? '…' : d.up === false ? 'not answering' : d.on ? 'on' : 'off';
      const cmd = `turn ${d.on ? 'off' : 'on'} ${d.name}`;
      return `<button type="button" class="hm-tile hm-${cls}" data-say="${esc(cmd)}" title="says: ${esc(cmd)}">
        <span class="hm-glyph">${GLYPH[d.kind] || '•'}</span><span class="hm-name">${esc(d.name)}</span>
        <span class="hm-state">${esc(word)}</span>${d.where ? `<span class="hm-where">${esc(d.where)}</span>` : ''}</button>`;
    }).join('')}</div>
    <div class="hm-scenes">${(this.map?.scenes || []).map(s => `<button type="button" class="chip" data-say="${esc(s.say)}" title="says: ${esc(s.say)}">${esc(s.label)}</button>`).join('')}
      <span class="hm-backend">${this.backend === 'sim' ? 'simulated devices (no Home Assistant entities named yet)' : this.backend === 'ha' ? 'through Home Assistant' : ''}</span></div>`;
    for (const b of this.el.querySelectorAll('[data-say]')) b.onclick = () => this.say(b.dataset.say);
  }
}
