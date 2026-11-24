#!/bin/sh
# metis-home for acasa-metis-home.service: the home's rules on Home Assistant when its token file
# is there (waiting for it to come up, as after a boot), else on simulated devices.
# Paths: METIS (~/repo/perotheia-packages), HA_URL, HA_TOKEN (~/.config/fsttm/hass.token).
METIS=${METIS:-$HOME/repo/perotheia-packages}
HA_URL=${HA_URL:-http://127.0.0.1:8123}
HA_TOKEN=${HA_TOKEN:-$HOME/.config/fsttm/hass.token}
unset METIS_HOME_HA
if [ -s "$HA_TOKEN" ]; then
	for i in $(seq 1 60); do
		if curl -s -o /dev/null -m 3 "$HA_URL/"; then
			export METIS_HOME_HA=$HA_URL METIS_HOME_TOKEN=$HA_TOKEN
			break
		fi
		sleep 2
	done
fi
echo "Home Assistant: ${METIS_HOME_HA:-not reached (or no token at $HA_TOKEN): simulated devices}"
export METISC=$METIS/metis-lang/src/metisc
exec "$METIS/metis-agent-home/go/bin/metis-home" -world "${HOME_WORLD:-$HOME/repo/nina-live/catalog}"
