// nina: Nina at home, with Home Assistant as her backend: the persona (nina-live's app: her voice, her
// core, her rules, her tasks) and acasa's hass behind every far end she reaches (the devices, the house's
// states, the agenda's calendars and lists, the music player, the Echo for the glow, her persona's sensor,
// the radar, the photo albums). Moved here from nina-live (the redesign's step 1, s-b478fe59): the persona
// depends on no deployment.
//
//	nina -config ~/repo/acasa/live/nina.yaml
package main

import (
	"context"
	"encoding/json"
	"flag"
	stdlog "log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ibnHatab/acasa/hass"
	"github.com/ibnHatab/nina-live/agenda"
	"github.com/ibnHatab/nina-live/app"
	"github.com/ibnHatab/nina-live/core"
	"github.com/ibnHatab/nina-live/music"
	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
	"gopkg.in/yaml.v3"
)

// Config is nina.yaml: the persona's sections and Home Assistant's.
type Config struct {
	app.Config `yaml:",inline"`
	Hass       struct {
		URL   string `yaml:"url"`
		Token string `yaml:"token"`
		// Via: "mcp", Home Assistant only through its MCP server (ha-mcp, the MCP entry named by Server: default
		// hacfg) and only for the home's devices and sensors (the user, 2026-11-28); "" its REST and websocket API
		Via    string `yaml:"via"`
		Server string `yaml:"server"`
	} `yaml:"hass"`
}

func now() float64 { return float64(time.Now().UnixNano()) / 1e9 }

func main() {
	cfgPath := flag.String("config", "~/.config/nina/nina.yaml", "nina.yaml")
	flag.Parse()
	var c Config
	b, err := os.ReadFile(app.Expand(*cfgPath))
	if err != nil {
		stdlog.Fatal(err)
	}
	if err := yaml.Unmarshal(b, &c); err != nil {
		stdlog.Fatalf("%s: %v", *cfgPath, err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	m, err := semhome.LoadMap(filepath.Join(app.Expand(c.Home.Root), "world", "home.map.json"))
	if err != nil {
		stdlog.Fatal(err)
	}
	var backs app.Backends
	if c.Hass.Via == "mcp" {
		backs, err = MCPBackends(ctx, c, m, filepath.Join(app.Expand(c.Home.Root), "world", "home.map.json"))
	} else {
		var ha *hass.Client
		if ha, err = hass.New(c.Hass.URL, c.Hass.Token); err == nil {
			backs = Backends(ha, m)
		}
	}
	if err != nil {
		stdlog.Fatal(err)
	}
	backs.HassURL, backs.HassToken = c.Hass.URL, c.Hass.Token // her setup checks the token
	if err := app.Run(ctx, c.Config, backs); err != nil {
		stdlog.Fatal(err)
	}
}

// Backends are Home Assistant's for every far end of the persona.
func Backends(ha *hass.Client, m *semhome.Map) app.Backends {
	call := func(ctx context.Context, domain, service string, data map[string]any) error {
		_, err := ha.Service(ctx, domain, service, data, false)
		return err
	}
	obs := hass.NewObserver(ha) // Home Assistant's standard classes: weather, lists, calendars, timers, people, players
	return app.Backends{
		Device: hass.NewDevice(ha, m),
		Agenda: agenda.HA{Call: call, Response: func(ctx context.Context, domain, service string, data map[string]any) (map[string]json.RawMessage, error) {
			return ha.Service(ctx, domain, service, data, true)
		}},
		Music: music.HA{Call: call},
		Glow: func(ctx context.Context, commands []string) error { // script.alexa_quiet: the Echo silenced
			return call(ctx, "script", "alexa_quiet", map[string]any{"commands": commands})
		},
		Publish: func(state string, attrs map[string]any) { // Nina's persona, for the dashboard (sensor.nina_persona)
			if _, err := ha.Call("POST", "/api/states/sensor.nina_persona", map[string]any{"state": state, "attributes": attrs}); err != nil {
				stdlog.Printf("[persona] %v", err)
			}
		},
		Reader:   reader{obs},
		Observed: obs.Lines,
		Watch: func(ctx context.Context, apply func(semhome.Event) (semhome.Out, error), line func(key, text string)) {
			obs.OnLine = line
			go obs.Run(ctx, 10*time.Minute)
			if err := ha.Follow(ctx, obs.Feed(apply), now); err != nil {
				stdlog.Printf("[hass] %v: the world gets no readings", err)
			}
		},
		Presence: func(ctx context.Context, set func(core.Presence)) { radar(ctx, restViewer(ha), set) },
		Albums:   func(ctx context.Context) ([]string, error) { return googleAlbums(ctx, ha) },
	}
}

// reader: the read tools' lists, calendars and weather, Home Assistant's entities of each class.
type reader struct{ o *hass.Observer }

func (r reader) named(class string) []app.Named {
	var out []app.Named
	for _, st := range r.o.Entities(class) {
		n, _ := st.Attributes["friendly_name"].(string)
		out = append(out, app.Named{ID: st.EntityID, Name: n})
	}
	return out
}

func (r reader) Lists() []app.Named     { return r.named("todo") }
func (r reader) Calendars() []app.Named { return r.named("calendar") }
func (r reader) Weathers() []app.Named  { return r.named("weather") }
func (r reader) Items(ctx context.Context, id, status string) ([]string, error) {
	return r.o.Items(ctx, id, status)
}
func (r reader) Events(ctx context.Context, id string, window time.Duration, n int) ([]string, error) {
	return r.o.Events(ctx, id, window, n)
}
func (r reader) Forecast(ctx context.Context, id, kind string, n int) (string, error) {
	return r.o.Forecast(ctx, id, kind, n)
}

// viewer is the radar's sensor now (sensor.nina_viewer): its state, its last update, its attributes.
type viewer func(ctx context.Context) (state, updated string, attrs map[string]any, err error)

func restViewer(ha *hass.Client) viewer {
	return func(context.Context) (string, string, map[string]any, error) {
		raw, err := ha.Call("GET", "/api/states/sensor.nina_viewer", nil)
		if err != nil {
			return "", "", nil, err
		}
		var st struct {
			State      string         `json:"state"`
			Updated    string         `json:"last_updated"`
			Attributes map[string]any `json:"attributes"`
		}
		if err := json.Unmarshal(raw, &st); err != nil {
			return "", "", nil, err
		}
		return st.State, st.Updated, st.Attributes, nil
	}
}

// radar: sensor.nina_viewer (the Pi's LD2410C): presence and distance, until ctx ends.
func radar(ctx context.Context, get viewer, set func(core.Presence)) {
	last, stale := "", false
	tk := time.NewTicker(2 * time.Second)
	defer tk.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tk.C:
		}
		var st struct {
			State      string
			Updated    string
			Attributes map[string]any
		}
		var err error
		if st.State, st.Updated, st.Attributes, err = get(ctx); err != nil {
			continue // no radar yet
		}
		// a reading that has not changed in 10 min is a radar gone (its Pi off): nobody, not a person
		// held at its last distance (2026-11-26: 0.54 m from the day before capped her bubble)
		if t, err := time.Parse(time.RFC3339Nano, st.Updated); err == nil && time.Since(t) > 10*time.Minute {
			if !stale {
				stale = true
				set(core.Presence{})
			}
			continue
		}
		if st.Updated == last {
			continue
		}
		last, stale = st.Updated, false
		p := core.Presence{Present: st.State == "present"}
		p.Distance, _ = st.Attributes["distance"].(float64)
		p.Near, _ = st.Attributes["near"].(bool)
		p.InReach, _ = st.Attributes["in_reach"].(bool)
		p.Trend, _ = st.Attributes["trend"].(string)
		set(p)
	}
}
