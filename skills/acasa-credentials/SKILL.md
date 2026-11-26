---
name: acasa-credentials
description: The rules and the map for every credential a Nina machine needs (Gemini API key, Google OAuth client for Home Assistant's Google integrations, YouTube API key, Home Assistant long-lived token, OpenRouter key, WhatsApp linked device) — where each lives, which skill creates it, and the safety rules for handling secrets with a person. Use first whenever a Nina setup needs a key, token, OAuth client or account linked, or when a service reports a missing or rejected credential.
---

# Credentials for a Nina machine

How the first machines were set up, as one skill per credential:

| credential | file (chmod 600) | used by | skill |
|---|---|---|---|
| Gemini API key | `~/.config/fsttm/gemini.key` | her ears, voice, task models | `acasa-cred-gemini-key` |
| Google OAuth client (+ Cloud APIs, consent screen) | `~/.config/nina/<account>-google-oauth-client.json`; HA's application credentials | HA Google Calendar, Tasks, Photos, YouTube | `acasa-cred-google-oauth` |
| YouTube API key | `~/.config/nina/youtube.key` | her video search | `acasa-cred-youtube-key` |
| Home Assistant token | `~/.config/fsttm/hass.token` | everything she does in HA; ha-ui; MCP | `acasa-cred-ha-token` |
| OpenRouter key (backup model) | `~/.config/nina/openrouter.env` | her tasks' backup when Google is busy | `acasa-cred-openrouter` |
| WhatsApp linked device | `~/.local/share/nina/whatsapp.db` | her WhatsApp channel | `acasa-cred-whatsapp-link` |

## Rules for every credential

- **The person signs in.** Never type a password, verification code, OAuth client secret, card or
  account number into a form; never click an "Allow"/consent for them. Fill non-secret fields (a
  name, a redirect URI, a client ID) and let the person do the rest.
- **A secret lives in a file**, never in chat, a config file, a commit, a URL or a log. Configs name
  the file (`key: ~/.config/fsttm/gemini.key`). Create it with `umask 077` / `chmod 600`.
- Copying a secret between files or machines is fine **without printing it**
  (`scp FILE host:.config/nina/…`, then `chmod 600` there). Report only the path, the mode and at
  most the first characters of a non-secret ID.
- **Creating** a key, client, project or account is the person's decision: say what will be created
  where, then do it with them.
- Downloads need the person's yes (once per task).
- Each machine/role has its **own** Google account and Cloud project (its own quota); never reuse
  another person's.

## Verify, don't assume

After any credential step, check it from the machine (each skill has its check) and look at Nina's
log for the line that proves it (`whatsapp: connected`, no `youtube: no API key`).
