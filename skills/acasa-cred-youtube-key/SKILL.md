---
name: acasa-cred-youtube-key
description: Create and install the YouTube Data API v3 key that Nina's screen tool uses to search videos and resolve public playlists, configure her own playlists by name, and verify it. Use when Nina says she has no YouTube key, when video search fails, or when setting up a new machine's videos.
---

# The YouTube API key (her video search)

Rules: `acasa-credentials` (the person creates the key; it lives in a file).

## Create

In the role's Cloud project (the APIs from `acasa-cred-google-oauth` §1 include YouTube Data API v3):
Credentials → Create credentials → **API key** → restrict it to **YouTube Data API v3** (an API
restriction only: a home's IP changes, an IP restriction would break it).

## Install

```sh
umask 077; mkdir -p ~/.config/nina
# the person writes the key into ~/.config/nina/youtube.key; or copy an existing file without printing it:
#   scp SOURCE_FILE nina@HOST.local:.config/nina/youtube.key && ssh nina@HOST.local chmod 600 .config/nina/youtube.key
chmod 600 ~/.config/nina/youtube.key
```

Core config (default path if omitted):

```yaml
youtube:
  key: ~/.config/nina/youtube.key
  playlists:            # her own, by name (unlisted ones cannot be listed with a key: give their ids)
    Claudia: PLSh0S6uPqqgA
```

Restart Nina (`acasa-machine-update` or `systemctl --user restart nina|acasa-nina`).

## Check

- Her log at start has no `youtube: no API key`.
- A silent test: wake-cycle "Nina, show me a video about how to descale a coffee machine." → tool
  `screen` with `query`, a `stage` event with ~10 video ids, the stage plays the first (set the
  stage volume to 0 if you watch it; no sound after 22:00).
- Quota: a search costs 100 of the day's 10,000 units.
