# Credentials for a Nina machine: Google APIs and WhatsApp

How the credentials of a Nina machine were set up (Pascal and pero, 2026-11-25/26), written for
the agents that will do it next (a skill set). What worked, in order, and what failed on the way.

## Rules that hold for every step

- **The person signs in.** An agent never types a password, a verification code, or an OAuth client
  secret into a form. It fills in non-secret fields (a name, a client ID), the person does the rest.
- **A secret lives in a file, never in chat, a config file or a commit:** `~/.config/fsttm/…` or
  `~/.config/nina/…`, `chmod 600`, read by path from the config. An agent may copy a secret from one
  file to another on the machine without printing it; it reports only the path and the first
  characters of a client ID.
- **Creating a key, a client or an account** is the person's decision: say what will be created where,
  then do it with them (or they do it).
- **Downloads** (libraries, images) need the person's yes, said once for the task.

## Google: one Cloud project per account

Each machine's Home Assistant signs in to its own Google account (the home's, the office's), with its own
Cloud project; which account a machine uses is in its private notes, not here.

### 1. Gemini API key (her voice, ears, task model)

- AI Studio (aistudio.google.com) → Get API key, in the account's project.
- New keys have the `AQ.` format (53 characters): accepted as they are (`x-goog-api-key`).
- File: `~/.config/fsttm/gemini.key` (600). Configs point at it (`key:` in nina.yaml's tasks, the
  dialogue's `key`).
- Check: `curl -H "x-goog-api-key: $(cat FILE)" …/v1beta/models/MODEL:generateContent` → 200.
- **503 "high demand"** is Google's load, not the key: give the task runner Flash-Lite fallbacks
  (`tasks.fallback`: gemini-3.5-flash-lite, gemini-3.1-flash-lite). nina-live passes over an overloaded
  model for 5 min and does not retry it.

### 2. APIs to enable (APIs & Services → Library)

| API | for |
|---|---|
| Google Calendar API | HA `google` (her calendar) |
| Google Tasks API | HA `google_tasks` |
| Photos Library API | HA `google_photos` (upload, albums; reads only what the app created, Google's rule since 2025) |
| YouTube Data API v3 | HA `youtube`, and Nina's own video search (an API key) |
| Photos Picker API | not used yet (choosing photos from the whole library would need it) |

### 3. OAuth consent screen (Google Auth Platform)

- App name ("Nina"), support email, **External**.
- **Branding: a home page and a privacy policy URL** are required to publish:
  `https://ibnhatab.github.io/nina-live/` and `…/privacy.html` (GitHub Pages from nina-live `docs/`).
- **Data Access: add the scopes** the integrations ask for: calendar, tasks, `photoslibrary.appendonly`
  + `photoslibrary.readonly.appcreateddata`, `youtube.readonly`. Missing one → HA says
  "Request had insufficient authentication scopes".
- **Publish** (In production, unverified is fine for one's own accounts; Testing expires tokens weekly).

### 4. OAuth client (Credentials → Create credentials → OAuth client ID)

- Type **Web application**; Authorized redirect URI **exactly**
  `https://my.home-assistant.io/redirect/oauth`.
- Keep the downloaded JSON as `~/.config/nina/<account>-google-oauth-client.json` (600). On Pascal it was
  rebuilt from HA's `.storage/application_credentials` (the same client the calendar used).

### 5. Home Assistant side

- `configuration.yaml` must load **`my:`** (in `default_config`, or listed when default_config is
  trimmed). Without it HA sends its own localhost callback and Google answers **Error 400:
  redirect_uri_mismatch**.
- In the browser where the person signs in, **My Home Assistant** (my.home-assistant.io) must point at
  this machine's HA (`http://localhost:8123`, `http://pero.local:8123`); pointing at another gives
  **"Invalid state"**.
- Chrome skips mDNS (`pero.local`): put the Pi in `/etc/hosts`; Firefox resolves it.
- Settings → Devices & services → Add integration → Google Calendar / Google Tasks / Google Photos /
  YouTube: each asks for **application credentials** (a name, the client ID, the client secret: the
  person pastes the secret), then the Google sign-in window: the person signs in.

### 6. YouTube API key (Nina's video search)

- Credentials → Create credentials → **API key**, restricted to **YouTube Data API v3**.
- File: `~/.config/nina/youtube.key` (600); nina.yaml `youtube.key` points at it. A search costs 100
  of the day's 10,000 units.
- Her own playlists by name: `youtube.playlists` in nina.yaml (unlisted ones cannot be listed with a key).

## WhatsApp (nina-live whatsapp/: whatsmeow, a linked device)

- **Unofficial client:** WhatsApp can ban a number for it. A spare number (the office's) is safe to risk; the person's primary number only by their choice (Pascal).
- **Register the number** in WhatsApp on a phone first (the phone stays the account's primary device;
  it must come online at least every 14 days).
- **Link by QR**, Nina stopped or not (an unlinked Nina does not connect):
  `~/repo/nina-live/bin/nina-whatsapp link-qr` writes a page that follows the codes:
  `http://<machine>:8770/nina/wa-link.html`. On the phone: Settings → Linked devices → Link a device →
  scan. A session lasts ~160 s (run again for a new one). Then restart Nina
  (`systemctl --user restart nina` / `acasa-nina`) and delete the page (it removes its PNG itself).
- **Pairing by phone code** (`nina-whatsapp link PHONE`) gave "Couldn't link device" twice even with the
  pairing session open first; WhatsApp's servers sent nothing back. Use the QR. (`-debug` prints
  whatsmeow's exchange.)
- **Config** (nina.yaml `whatsapp:`): `answer: named` (direct messages, and groups that name her or reply
  to her) | `self` (only the number's own "Message yourself" chat, her words as "Nina: …": a primary
  number) | `none`; `keep:` chats stored (`self`, names, `all`; none listed: all); `show:` groups on her
  screen's card (also her settings card's WhatsApp field); `min_gap`, `per_hour` throttle. The store:
  `~/.local/share/nina/whatsapp.db` (whatsmeow's keys and her messages: treat as a secret).
- **Group names:** stop Nina, `nina-whatsapp groups`, start her (two connections of one device kick each
  other off).
- **Read receipts** need her to be online (she sends a presence at connect; the account's own read-receipt
  privacy setting applies).
- **Unlink:** on the phone, Linked devices → the "Chrome" device → Log out; then delete the store file.

## Checks after setup

- `curl -s http://127.0.0.1:8770/api/state` (her panel) — `facts.whatsapp.linked`, settings.
- Her log: `journalctl --user -u acasa-nina` (Pascal) / `sudo journalctl _SYSTEMD_USER_UNIT=nina.service`
  (a Pi): "whatsapp: connected (answers: …)", no "youtube: no API key".
- A direct test: WhatsApp message (named mode) or the self-chat (self mode); a video search through
  `fsttm-live/bin/wake-cycle -script` ("Nina, show me a video about …").
