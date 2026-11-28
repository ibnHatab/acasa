package hass

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/ibnHatab/nina-live/mcp"
	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// MCP is Home Assistant through its MCP server, ha-mcp (acasa live/ha-mcp): the user's decision (2026-11-28),
// Nina reaches Home Assistant only through MCP, and only for the home's devices and sensors. Its service calls
// are ha_call_service (the Device's, the music player's, the Echo's), its states ha_get_state, polled (Follow:
// the changed ones folded into her world, as the websocket's state_changed were).
type MCP struct {
	C       *mcp.Client
	Timeout time.Duration // a call's (default 15 s)
}

func (m *MCP) ctx() (context.Context, context.CancelFunc) {
	t := m.Timeout
	if t <= 0 {
		t = 15 * time.Second
	}
	return context.WithTimeout(context.Background(), t)
}

// CallService: ha_call_service(domain, service, entity_id, data).
func (m *MCP) CallService(domain, service string, data map[string]any) error {
	ctx, cancel := m.ctx()
	defer cancel()
	return m.Service(ctx, domain, service, data)
}

// Service is CallService with the caller's context.
func (m *MCP) Service(ctx context.Context, domain, service string, data map[string]any) error {
	args := map[string]any{"domain": domain, "service": service}
	rest := map[string]any{}
	for k, v := range data {
		if k == "entity_id" {
			args["entity_id"] = v
		} else {
			rest[k] = v
		}
	}
	if len(rest) > 0 {
		args["data"] = rest
	}
	text, isErr, err := m.C.Call(ctx, "ha_call_service", args)
	if err != nil {
		return err
	}
	if isErr || strings.Contains(text, `"success": false`) || strings.Contains(text, `"success":false`) {
		return fmt.Errorf("ha_call_service %s.%s: %s", domain, service, first(text, 300))
	}
	return nil
}

func first(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// States are the entities' states now (ha_get_state, at most 100 a call).
func (m *MCP) States(ctx context.Context, ids []string) (map[string]semhome.HAState, error) {
	out := map[string]semhome.HAState{}
	for i := 0; i < len(ids); i += 100 {
		part := ids[i:min(i+100, len(ids))]
		text, isErr, err := m.C.Call(ctx, "ha_get_state", map[string]any{"entity_id": part, "fields": []any{"entity_id", "state", "attributes"}})
		if err != nil {
			return nil, err
		}
		if isErr {
			return nil, fmt.Errorf("ha_get_state: %s", first(text, 300))
		}
		var r map[string]any
		if err := json.Unmarshal([]byte(text), &r); err != nil {
			return nil, fmt.Errorf("ha_get_state: %w", err)
		}
		for id, st := range statesOf(r) {
			out[id] = st
		}
	}
	return out, nil
}

// statesOf finds the records in ha_get_state's answer: {states: {id: record}} (bulk, maybe under data), or one record.
func statesOf(r map[string]any) map[string]semhome.HAState {
	out := map[string]semhome.HAState{}
	rec := func(id string, x any) {
		m, _ := x.(map[string]any)
		if m == nil {
			return
		}
		st := semhome.HAState{EntityID: id}
		if e, _ := m["entity_id"].(string); e != "" {
			st.EntityID = e
		}
		st.State, _ = m["state"].(string)
		st.Attributes, _ = m["attributes"].(map[string]any)
		if st.Attributes == nil {
			st.Attributes = map[string]any{}
		}
		if st.EntityID != "" && st.State != "" {
			out[st.EntityID] = st
		}
	}
	for _, c := range []map[string]any{r, asMap(r["data"])} {
		if c == nil {
			continue
		}
		if ss := asMap(c["states"]); ss != nil {
			for id, x := range ss {
				rec(id, x)
			}
		}
		if _, ok := c["state"]; ok {
			id, _ := c["entity_id"].(string)
			rec(id, c)
		}
	}
	return out
}

func asMap(x any) map[string]any { m, _ := x.(map[string]any); return m }

// Follow polls the entities every period (default 2 s) and folds each one whose state or attributes changed
// into the world (the first poll: every one), until ctx ends.
func (m *MCP) Follow(ctx context.Context, ids []string, apply Apply, now func() float64, every time.Duration) error {
	if every <= 0 {
		every = 2 * time.Second
	}
	last := map[string]semhome.HAState{}
	fails := 0
	for {
		c, cancel := context.WithTimeout(ctx, 20*time.Second)
		sts, err := m.States(c, ids)
		cancel()
		if err != nil {
			if fails++; fails == 1 || fails%30 == 0 {
				log.Printf("[ha-mcp] the states: %v", err)
			}
		} else {
			fails = 0
			keys := make([]string, 0, len(sts))
			for id := range sts {
				keys = append(keys, id)
			}
			sort.Strings(keys)
			for _, id := range keys {
				st := sts[id]
				if was, ok := last[id]; ok && was.State == st.State && reflect.DeepEqual(was.Attributes, st.Attributes) {
					continue
				}
				last[id] = st
				s := st
				if _, err := apply(semhome.Event{At: now(), Kind: "ha_state", HA: &s}); err != nil {
					log.Printf("[ha-mcp] %s: %v", id, err)
				}
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(every):
		}
	}
}

// MapEntities are the entities the home map names (its devices, its sensors, the sun), and the extra ones
// given (the radar's sensor, the music player): what Follow polls.
func MapEntities(path string, extra ...string) ([]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []string
	add := func(e string) {
		if e != "" && strings.Contains(e, ".") && !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	var dev map[string]struct {
		Entity *string `json:"entity"`
		Prefix string  `json:"prefix"`
	}
	for _, k := range []string{"lights", "tvs"} {
		dev = nil
		json.Unmarshal(m[k], &dev)
		for _, d := range dev {
			if d.Entity != nil {
				add(*d.Entity)
			}
		}
	}
	dev = nil
	json.Unmarshal(m["units"], &dev)
	for _, d := range dev {
		if d.Prefix != "" {
			for _, e := range []string{"fan.%s_supply_fan", "fan.%s_extract_fan", "switch.%s_heater", "switch.%s_winter"} {
				add(fmt.Sprintf(e, d.Prefix))
			}
		}
	}
	var radar map[string]any
	json.Unmarshal(m["radar"], &radar)
	for _, v := range radar {
		if s, ok := v.(string); ok {
			add(s)
		}
	}
	var th map[string]any
	json.Unmarshal(m["thermometers"], &th)
	for _, v := range th {
		if t, ok := v.(map[string]any); ok {
			for _, x := range t {
				if s, ok := x.(string); ok {
					add(s)
				}
			}
		}
	}
	var sun string
	if json.Unmarshal(m["sun"], &sun) == nil {
		add(sun)
	}
	for _, e := range extra {
		add(e)
	}
	sort.Strings(out)
	return out, nil
}
