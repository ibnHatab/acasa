#!/usr/bin/env bash
# ha-mcp (homeassistant-ai/ha-mcp: automations, scripts, scenes, dashboards, ...) for Nina's tasks
# (acasa, 2026-11-25). Streamable HTTP on loopback only: http://127.0.0.1:8086/mcp. Home Assistant's
# token is read from its file here, never kept in a config. Installed by: uv tool install --python 3.13 ha-mcp
set -euo pipefail
export HOMEASSISTANT_URL="${HA_URL:-http://127.0.0.1:8123}"
HOMEASSISTANT_TOKEN="$(tr -d '[:space:]' < "$HOME/.config/fsttm/hass.token")"
export HOMEASSISTANT_TOKEN
export MCP_HOST=127.0.0.1 MCP_PORT="${MCP_PORT:-8086}"
# its best practices stay attached to every write (advisory); the strict gate (a write refused until the
# model fetched a key from its skill guide) is off: Flash spent its turns on it (2026-11-25)
export ENABLE_STRICT_MANDATORY_BPS=false
exec "$HOME/.local/bin/ha-mcp-web"
