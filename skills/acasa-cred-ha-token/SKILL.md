---
name: acasa-cred-ha-token
description: Create and install the Home Assistant long-lived access token Nina uses (her Home Assistant client, the dashboards' cmd/ha-ui, the MCP servers, the rule hosts), and verify it. Use on a new machine after Home Assistant onboarding, when Nina or ha-ui gets 401 from Home Assistant, or when the token was revoked.
---

# Nina's Home Assistant token

Rules: `acasa-credentials`.

## Create (the person, in Home Assistant)

Profile (bottom-left) → **Security** → *Long-lived access tokens* → **Create token** → name `nina`.
Home Assistant shows it once.

## Install

```sh
umask 077; mkdir -p ~/.config/fsttm
# the person pastes it into ~/.config/fsttm/hass.token (one line)
chmod 600 ~/.config/fsttm/hass.token
```

Referenced by path in the core yaml: `hass.token`, each `mcp[].token_file`. ha-ui and update.sh
read the same file. Never put the token itself in a config.

## Check

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/.config/fsttm/hass.token)" http://127.0.0.1:8123/api/
```

200 is good (401: wrong or revoked token). Then `~/repo/acasa/install/update.sh` applies the look and
feel (it skips that step while the file is missing) and restarts Nina; her log says Home Assistant
connected.

## Revoke / rotate

Delete the token in the same Security page, create a new one, replace the file, restart Nina.
