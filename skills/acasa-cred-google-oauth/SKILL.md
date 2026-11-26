---
name: acasa-cred-google-oauth
description: Set up Google Cloud for a Nina machine's Home Assistant Google integrations (Google Calendar, Google Tasks, Google Photos, YouTube) — enable the APIs, configure and publish the OAuth consent screen with the right scopes, create the Web OAuth client with My Home Assistant's redirect, prepare Home Assistant (my:, My Home Assistant URL, mDNS), and add the integrations with application credentials. Use when adding any Google integration to Home Assistant for Nina, or on redirect_uri_mismatch, "Invalid state" or "insufficient authentication scopes" errors.
---

# Google OAuth for Home Assistant's Google integrations

Follow `acasa-credentials`' rules: the person signs in to Google, pastes the client secret, and
approves consent screens. The agent may fill names, URIs and the client ID.

One Google account and one Cloud project **per role/machine** (each Home Assistant signs in to its own).

## 1. Enable the APIs (Cloud Console → APIs & Services → Library)

| API | for |
|---|---|
| Google Calendar API | HA `google` (her calendar) |
| Google Tasks API | HA `google_tasks` |
| Photos Library API | HA `google_photos` (reads only what the app created — Google's rule since 2025) |
| YouTube Data API v3 | HA `youtube`; also her search key (`acasa-cred-youtube-key`) |

## 2. OAuth consent screen (Google Auth Platform)

- App name (e.g. "Nina"), support email, audience **External**.
- **Branding**: a home page and a privacy-policy URL are required to publish. Host them for this
  deployment (e.g. GitHub Pages from a repo's `docs/`); don't reuse another project's pages.
- **Data access — add the scopes** the integrations request: Calendar, Tasks,
  `photoslibrary.appendonly`, `photoslibrary.readonly.appcreateddata`, `youtube.readonly`. A missing
  scope shows in HA as "Request had insufficient authentication scopes".
- **Publish** to *In production* (unverified is fine for one's own accounts). *Testing* expires
  refresh tokens weekly and the integrations break.

## 3. OAuth client (Credentials → Create credentials → OAuth client ID)

- Type **Web application**; Authorized redirect URI **exactly** `https://my.home-assistant.io/redirect/oauth`.
- The person downloads the JSON: keep it as `~/.config/nina/<account>-google-oauth-client.json`
  (600). It holds the secret — never print it.

## 4. Home Assistant side (before adding integrations)

- `configuration.yaml` loads **`my:`** (in `default_config`, or listed explicitly when default_config
  is trimmed). Without it HA sends a localhost callback → Google **Error 400: redirect_uri_mismatch**.
- In the browser where the person signs in, **My Home Assistant** (my.home-assistant.io) points at
  *this* machine's HA (`http://localhost:8123`, `http://HOST.local:8123`); another HA → **"Invalid state"**.
- Chrome on Linux skips mDNS: put `HOST.local` in the desktop's `/etc/hosts` (Firefox resolves it).

## 5. Add the integrations

Settings → Devices & services → Add integration → Google Calendar / Google Tasks / Google Photos /
YouTube. Each asks for **application credentials** (a name, the client ID, the client secret — the
person pastes the secret), then Google's sign-in and consent — the person.

## Check

- The integration shows entities (`calendar.*`, `todo.*`); `curl` HA's `/api/states` with the token
  and list `calendar.`/`todo.` entities.
- Map them in the role's core config `agenda:` (her calendar, the person's read-only calendar, the
  task list) — see acasa-role.
- Google Photos: only albums the integration created are visible; an album must be created and filled
  through HA (upload) before Nina can show it.
