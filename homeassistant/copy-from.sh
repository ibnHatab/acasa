#!/bin/sh
# Copy a machine's whole Home Assistant (integrations, devices, accounts, tokens) to this one:
#   homeassistant/copy-from.sh nuc
# Stops Home Assistant there (a consistent .storage), copies its ~/homeassistant/config over
# ssh, keeps this machine's own config as config.before-<date>, starts Home Assistant here.
# The other machine's Home Assistant is left stopped (it runs in one place); start it there
# again with: ssh HOST 'cd ~/homeassistant && docker compose start'.
set -eu
SRC=${1:?usage: $0 HOST}
HERE=$HOME/homeassistant
ssh "$SRC" 'cd ~/homeassistant && docker compose stop'
cd "$HERE"
docker compose stop
[ -d config ] && mv config "config.before-$(date +%Y%m%d-%H%M%S)"
mkdir config
ssh "$SRC" 'sudo tar -C ~/homeassistant/config -czf - .' | sudo tar -C config -xzf -
sudo chown -R "$(id -u):$(id -g)" config
docker compose start
for i in $(seq 1 60); do
	c=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:8123/ || true)
	[ "$c" = 200 ] || [ "$c" = 302 ] && break
	sleep 3
done
echo "Home Assistant from $SRC: http $c"
