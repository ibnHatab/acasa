package main

import (
	"context"
	"fmt"
	"time"

	"github.com/ibnHatab/acasa/hass"
	"github.com/ibnHatab/nina-live/app"
	"github.com/ibnHatab/nina-live/core"
	"github.com/ibnHatab/nina-live/mcp"
	"github.com/ibnHatab/nina-live/music"
	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// MCPBackends: Home Assistant only through its MCP server, only for the home's devices and sensors (the user,
// 2026-11-28): the devices, the music player and the Echo's glow by ha_call_service; the house's states and the
// radar by ha_get_state, polled. Her calendars, lists, weather and photos are not Home Assistant's here: the
// config's services (Google's, Met.no's) give them. Nothing of hers is written into Home Assistant.
func MCPBackends(ctx context.Context, c Config, m *semhome.Map, mapPath string) (app.Backends, error) {
	name := c.Hass.Server
	if name == "" {
		name = "hacfg"
	}
	var srv *mcp.Server
	for i := range c.MCP {
		if c.MCP[i].Name == name {
			srv = &c.MCP[i]
		}
	}
	if srv == nil {
		return app.Backends{}, fmt.Errorf("hass.via mcp: no MCP server %q in the config's mcp list", name)
	}
	dctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cl, err := mcp.Dial(dctx, *srv)
	if err != nil {
		return app.Backends{}, fmt.Errorf("hass.via mcp: %w", err)
	}
	ha := &hass.MCP{C: cl}
	const viewerID = "sensor.nina_viewer"
	ids, err := hass.MapEntities(mapPath, viewerID, "media_player.music_player_daemon")
	if err != nil {
		return app.Backends{}, err
	}
	return app.Backends{
		Device: hass.NewDevice(ha, m),
		Music:  music.HA{Call: ha.Service},
		Glow: func(ctx context.Context, commands []string) error { // script.alexa_quiet: the Echo silenced
			return ha.Service(ctx, "script", "alexa_quiet", map[string]any{"commands": commands})
		},
		Watch: func(ctx context.Context, apply func(semhome.Event) (semhome.Out, error), _ func(key, text string)) {
			ha.Follow(ctx, ids, apply, now, 2*time.Second)
		},
		Presence: func(ctx context.Context, set func(core.Presence)) {
			radar(ctx, func(ctx context.Context) (string, string, map[string]any, error) {
				sts, err := ha.States(ctx, []string{viewerID})
				if err != nil {
					return "", "", nil, err
				}
				st, ok := sts[viewerID]
				if !ok {
					return "", "", nil, fmt.Errorf("no radar")
				}
				up, _ := st.Attributes["last_updated"].(string)
				if up == "" { // ha_get_state's record without it: its distance and state stand for a fresh reading
					up = fmt.Sprint(st.State, st.Attributes["distance"])
				}
				return st.State, up, st.Attributes, nil
			}, set)
		},
	}, nil
}
