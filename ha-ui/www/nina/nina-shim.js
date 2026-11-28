// Home Assistant's two elements her cards are built of, for her own screens (the user, 2026-11-28: her
// cards off the Home Assistant dashboards, on her panel and the tablet). Inside Home Assistant its own are
// defined and this does nothing. ha-card: a block; ha-icon: her own line icons for the mdi names the
// cards use (the guest layer's style: one stroke, currentColor), a dot for any other.
const P = {
  "mdi:fan": '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C11 6 13 3 15.5 4.5S15 10 12 10.4zM13.6 12c4.4-1 7.4 1 5.9 3.5S14 15 13.6 12zM12 13.6c1 4.4-1 7.4-3.5 5.9S9 14 12 13.6zM10.4 12C6 13 3 11 4.5 8.5S10 9 10.4 12z"/>',
  "mdi:fan-chevron-down": '<circle cx="12" cy="10" r="1.4"/><path d="M12 8.6C11 5 13 2.5 15 3.8S14.5 8.3 12 8.6zM13.4 10c3.6-.9 6 .9 4.8 2.9S13.7 12.5 13.4 10zM10.6 10C7 10.9 4.6 9.1 5.8 7.1S10.3 7.5 10.6 10zM8 18l4 3 4-3"/>',
  "mdi:weather-partly-cloudy": '<circle cx="9" cy="8" r="3"/><path d="M9 2v1.5M3 8h1.5M4.8 3.8l1 1M13.2 3.8l-1 1M7 19h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.5A2.8 2.8 0 0 0 7 19z"/>',
  "mdi:white-balance-sunny": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  "mdi:weather-sunset-down": '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 3v6M9 6l3 3 3-3M4.5 13.5l1.4 1M19.5 13.5l-1.4 1"/>',
  "mdi:thermometer": '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
  "mdi:radiator": '<path d="M5 6v12M9 6v12M13 6v12M17 6v12M3 9h18M3 15h18M4 20h2M16 20h2"/>',
  "mdi:calendar-heart": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 18.5l-2.6-2.5a1.6 1.6 0 0 1 2.6-1.9 1.6 1.6 0 0 1 2.6 1.9z"/>',
  "mdi:timeline-clock": '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  "mdi:timer-sand": '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
  "mdi:radio": '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-4"/><circle cx="8" cy="14" r="2.5"/><path d="M14 12h4M14 16h4"/>',
  "mdi:music": '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  "mdi:surround-sound": '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  "mdi:youtube": '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  "mdi:image-multiple": '<rect x="6" y="3" width="15" height="13" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12M6 13l4-4 3 3 2-2 6 6"/>',
  "mdi:whatsapp": '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>',
  "mdi:flag": '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  "mdi:lightbulb-on": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3zM12 0v1M3 9H2M22 9h-1M5 3l.7.7M19 3l-.7.7"/>',
  "mdi:ceiling-light": '<path d="M12 3v5M5 16a7 7 0 0 1 14 0zM10 19a2 2 0 0 0 4 0"/>',
  "mdi:sofa": '<path d="M4 12V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2"/>',
  "mdi:bed": '<path d="M3 6v13M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  "mdi:silverware-fork-knife": '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3"/>',
  "mdi:home": '<path d="M3 11l9-7 9 7M5 10v10h14V10"/>',
  "mdi:home-heart": '<path d="M3 11l9-7 9 7M5 10v10h14V10"/><path d="M12 17.5l-2.3-2.2a1.4 1.4 0 0 1 2.3-1.7 1.4 1.4 0 0 1 2.3 1.7z"/>',
  "mdi:brain": '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  "mdi:account-voice": '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 5a5 5 0 0 1 0 6M20 3a9 9 0 0 1 0 10"/>',
  "mdi:account-cog": '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 11-5.7"/><circle cx="18" cy="17" r="2.5"/><path d="M18 13v1.5M18 19.5V21M14 17h1.5M20.5 17H22"/>',
};

if (!customElements.get("ha-card")) customElements.define("ha-card", class extends HTMLElement {
  connectedCallback() { if (!this.style.display) this.style.display = "block"; }
});

if (!customElements.get("ha-icon")) customElements.define("ha-icon", class extends HTMLElement {
  static get observedAttributes() { return ["icon"]; }
  connectedCallback() { this.draw(); }
  attributeChangedCallback() { this.draw(); }
  set icon(v) { this.setAttribute("icon", v); }
  draw() {
    const p = P[this.getAttribute("icon")] || '<circle cx="12" cy="12" r="3"/>';
    this.style.display = "inline-flex";
    this.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)" aria-hidden="true">${p}</svg>`;
  }
});
