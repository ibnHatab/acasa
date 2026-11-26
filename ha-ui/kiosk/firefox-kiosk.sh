#!/bin/bash
# Launch Firefox against Home Assistant in a loop (no --kiosk: that blocks OSK).
set -eu

CONFIG=/etc/ha-pi-kiosk/config.env
if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG"
fi

KIOSK_URL="${KIOSK_URL:-https://home.whigham.me/?kiosk}"
PROFILE_DIR="${HOME}/.mozilla/firefox/ha-kiosk"
export MOZ_ENABLE_WAYLAND=1

FIREFOX_BIN=""
for candidate in firefox firefox-esr; do
  if command -v "$candidate" >/dev/null 2>&1; then
    FIREFOX_BIN="$(command -v "$candidate")"
    break
  fi
done

if [ -z "$FIREFOX_BIN" ]; then
  echo "ha-pi-kiosk: firefox not found" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR/chrome"

# Ensure profile prefs exist (idempotent)
if [ ! -f "$PROFILE_DIR/user.js" ]; then
  cat >"$PROFILE_DIR/user.js" <<'EOF'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.tabs.warnOnCloseOtherTabs", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("app.update.enabled", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.startup.firstrunSkipsHomepage", true);
user_pref("dom.disable_open_during_load", false);
EOF
fi

# the dark scheme (2026-11-25, the user: Pascal's dark looks much better; the Pi's desktop always
# reports light, so Home Assistant's Nina theme took its light mode): pages see prefers-color-scheme
# dark. Ensured on every start, so an existing profile gets it too.
# And media may start with sound by itself (2026-11-26: the stage's videos, opened by Nina at the person's
# request, would otherwise start silent until a tap).
for pref in 'user_pref("layout.css.prefers-color-scheme.content-override", 0);' 'user_pref("ui.systemUsesDarkTheme", 1);' \
  'user_pref("media.autoplay.default", 0);' 'user_pref("media.autoplay.blocking_policy", 0);'; do
  grep -qF "$pref" "$PROFILE_DIR/user.js" 2>/dev/null || echo "$pref" >>"$PROFILE_DIR/user.js"
done

if [ ! -f "$PROFILE_DIR/chrome/userChrome.css" ]; then
  cat >"$PROFILE_DIR/chrome/userChrome.css" <<'EOF'
/* Hide browser chrome so the panel looks like a dedicated wall display. */
#TabsToolbar,
#nav-bar,
#PersonalToolbar,
#titlebar,
#navigator-toolbox {
  visibility: collapse !important;
}
EOF
fi

# Nina (2026-11-24): wait until Home Assistant answers (it starts after the session at boot), and
# open at the screen's size (the HDMI panel is 1024x600)
HA_BASE="${KIOSK_URL%%\?*}"
while true; do
  # the config again before each start: a new KIOSK_URL takes effect at the next Firefox restart
  if [ -f "$CONFIG" ]; then . "$CONFIG"; fi
  HA_BASE="${KIOSK_URL%%\?*}"
  # Nina's waking-up page at once while Home Assistant starts (a minute on a cold boot), then the
  # dashboard: the launcher waits (curl), not the page (Firefox would not let a file:// page probe it)
  START_PAGE=/usr/local/share/ha-pi-kiosk/starting.html
  if [ -f "$START_PAGE" ] && ! curl -fsS -o /dev/null --max-time 2 "$HA_BASE"; then
    "$FIREFOX_BIN" --profile "$PROFILE_DIR" --new-instance --width 1024 --height 600 "file://${START_PAGE}" &
    SPLASH=$!
    until curl -fsS -o /dev/null --max-time 3 "$HA_BASE"; do
      sleep 2
      if [ -f "$CONFIG" ]; then . "$CONFIG"; fi
      HA_BASE="${KIOSK_URL%%\?*}"
    done
    kill "$SPLASH" 2>/dev/null || true
    wait "$SPLASH" 2>/dev/null || true # set -e: a Firefox we killed is not a failure
  fi
  until curl -fsS -o /dev/null --max-time 3 "$HA_BASE"; do # (no waking-up page) waiting, the config re-read too
    sleep 3
    if [ -f "$CONFIG" ]; then . "$CONFIG"; fi
    HA_BASE="${KIOSK_URL%%\?*}"
  done
  "$FIREFOX_BIN" \
    --profile "$PROFILE_DIR" \
    --new-instance \
    --width 1024 \
    --height 600 \
    "$KIOSK_URL" || true
  sleep 2
done
