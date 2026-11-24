package hass

// Home Assistant's standard entity classes as Nina's observations (the user's plan, 2026-11-24:
// Home Assistant is Nina's integration layer, Metis gives the domains their semantics). One
// adapter per class, never per service: the todo class covers Local To-do, Google Tasks, Todoist
// and the shopping list; the calendar class covers Google Calendar, Local Calendar and CalDAV;
// the weather class covers Met.no and Open-Meteo. An entity's line is what the voice and the tasks
// see; the services that answer (forecasts, items, events) are read with return_response.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// Classes are the entity classes observed (the domain part of an entity id) → Nina's domain.
var Classes = map[string]string{
	"weather":        "weather",
	"todo":           "tasks",
	"calendar":       "calendar",
	"timer":          "time",
	"person":         "people",
	"media_player":   "media",
	"device_tracker": "people",
	"location":       "location", // location.home: Home Assistant's configuration (Client.Location)
}

// Service calls a Home Assistant service; with response, its service_response (the entity → data).
func (c *Client) Service(ctx context.Context, domain, service string, data map[string]any, response bool) (map[string]json.RawMessage, error) {
	path := "/api/services/" + url.PathEscape(domain) + "/" + url.PathEscape(service)
	if response {
		path += "?return_response"
	}
	raw, err := c.Call("POST", path, data)
	if err != nil {
		return nil, err
	}
	if !response {
		return nil, nil
	}
	var r struct {
		ServiceResponse map[string]json.RawMessage `json:"service_response"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, err
	}
	return r.ServiceResponse, nil
}

// Observer keeps the observed classes' entities from the feed and words them.
type Observer struct {
	C   *Client
	Now func() time.Time
	// OnLine is an entity's line when it changes (its key: the entity id)
	OnLine func(key, line string)

	mu     sync.Mutex
	states map[string]semhome.HAState
	lines  map[string]string
	dirty  map[string]bool
}

func NewObserver(c *Client) *Observer {
	return &Observer{C: c, Now: time.Now, states: map[string]semhome.HAState{}, lines: map[string]string{}, dirty: map[string]bool{}}
}

// Class is an entity id's class, and whether it is observed.
func Class(entity string) (string, bool) {
	cl, _, _ := strings.Cut(entity, ".")
	_, ok := Classes[cl]
	return cl, ok
}

// Feed wraps the world's apply: every reading still goes to the world, and an observed class's
// entity is kept and marked for its next line.
func (o *Observer) Feed(apply Apply) Apply {
	return func(ev semhome.Event) (semhome.Out, error) {
		if ev.HA != nil {
			if _, ok := Class(ev.HA.EntityID); ok {
				o.mu.Lock()
				o.states[ev.HA.EntityID] = *ev.HA
				o.dirty[ev.HA.EntityID] = true
				o.mu.Unlock()
			}
		}
		return apply(ev)
	}
}

// Run words the changed entities (at once) and every entity (each refresh, for what changes
// without a state change: a forecast, an event's start drawing near).
func (o *Observer) Run(ctx context.Context, refresh time.Duration) {
	tk := time.NewTicker(2 * time.Second)
	defer tk.Stop()
	last := time.Time{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-tk.C:
		}
		o.mu.Lock()
		var ids []string
		all := time.Since(last) >= refresh
		for id := range o.states {
			if all || o.dirty[id] {
				ids = append(ids, id)
			}
		}
		o.dirty = map[string]bool{}
		o.mu.Unlock()
		if all {
			last = time.Now()
		}
		sort.Strings(ids)
		for _, id := range ids {
			line := o.Line(ctx, id)
			o.mu.Lock()
			changed := line != "" && o.lines[id] != line
			if changed {
				o.lines[id] = line
			}
			o.mu.Unlock()
			if changed && o.OnLine != nil {
				o.OnLine(id, line)
			}
		}
	}
}

// Lines are the observed entities' lines now.
func (o *Observer) Lines() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	var ids []string
	for id := range o.lines {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var out []string
	for _, id := range ids {
		out = append(out, o.lines[id])
	}
	return out
}

// Entities are the observed entities of a class.
func (o *Observer) Entities(class string) []semhome.HAState {
	o.mu.Lock()
	defer o.mu.Unlock()
	var out []semhome.HAState
	for id, st := range o.states {
		if cl, _ := Class(id); cl == class {
			out = append(out, st)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].EntityID < out[j].EntityID })
	return out
}

func name(st semhome.HAState) string {
	if n, ok := st.Attributes["friendly_name"].(string); ok && n != "" {
		return n
	}
	_, n, _ := strings.Cut(st.EntityID, ".")
	return strings.ReplaceAll(n, "_", " ")
}

func num(v any) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

// Line is an entity's line: its class's words for its state and what its services answer.
func (o *Observer) Line(ctx context.Context, id string) string {
	o.mu.Lock()
	st, ok := o.states[id]
	o.mu.Unlock()
	if !ok || st.State == "unavailable" || st.State == "unknown" && !strings.HasPrefix(id, "person.") {
		return ""
	}
	cl, _ := Class(id)
	n := name(st)
	switch cl {
	case "weather":
		s := fmt.Sprintf("weather (%s): %s", n, strings.ReplaceAll(st.State, "-", " "))
		if t, ok := num(st.Attributes["temperature"]); ok {
			s += fmt.Sprintf(", %.0f °C", t)
		}
		if f, err := o.Forecast(ctx, id, "daily", 3); err == nil && f != "" {
			s += "; " + f
		}
		return s
	case "todo":
		items, err := o.Items(ctx, id, "needs_action")
		if err != nil {
			return fmt.Sprintf("%s: %s open", n, st.State)
		}
		if len(items) == 0 {
			return n + ": empty"
		}
		return fmt.Sprintf("%s: %s", n, strings.Join(items, ", "))
	case "calendar":
		evs, err := o.Events(ctx, id, 7*24*time.Hour, 5)
		if err != nil || len(evs) == 0 {
			return n + ": nothing in the coming week"
		}
		return fmt.Sprintf("%s, the coming week: %s", n, strings.Join(evs, "; "))
	case "timer":
		if st.State == "active" {
			if fin, ok := st.Attributes["finishes_at"].(string); ok {
				if t, err := time.Parse(time.RFC3339, fin); err == nil {
					return fmt.Sprintf("timer %s: running, ends at %s", n, t.Local().Format("15:04"))
				}
			}
		}
		return fmt.Sprintf("timer %s: %s", n, st.State)
	case "location":
		return locationLine(st)
	case "person", "device_tracker":
		where := st.State
		if where == "not_home" {
			where = "away"
		}
		return fmt.Sprintf("%s: %s", n, where)
	case "media_player":
		s := fmt.Sprintf("%s: %s", n, st.State)
		if t, ok := st.Attributes["media_title"].(string); ok && t != "" {
			s += ", " + t
			if a, ok := st.Attributes["media_artist"].(string); ok && a != "" {
				s += " by " + a
			}
		}
		return s
	}
	return ""
}

// Forecast is a weather entity's next days in words.
func (o *Observer) Forecast(ctx context.Context, id, kind string, n int) (string, error) {
	r, err := o.C.Service(ctx, "weather", "get_forecasts", map[string]any{"entity_id": id, "type": kind}, true)
	if err != nil {
		return "", err
	}
	var x struct {
		Forecast []struct {
			Datetime    string   `json:"datetime"`
			Condition   string   `json:"condition"`
			Temperature *float64 `json:"temperature"`
			Templow     *float64 `json:"templow"`
			Precip      *float64 `json:"precipitation"`
		} `json:"forecast"`
	}
	if err := json.Unmarshal(r[id], &x); err != nil {
		return "", err
	}
	var parts []string
	for i, f := range x.Forecast {
		if i >= n {
			break
		}
		t, err := time.Parse(time.RFC3339, f.Datetime)
		if err != nil {
			continue
		}
		day := t.Local().Format("Mon")
		if i == 0 {
			day = "today"
		}
		s := day + " " + strings.ReplaceAll(f.Condition, "-", " ")
		if f.Temperature != nil && f.Templow != nil {
			s += fmt.Sprintf(" %.0f/%.0f °C", *f.Templow, *f.Temperature)
		}
		if f.Precip != nil && *f.Precip > 0 {
			s += fmt.Sprintf(" %.1f mm", *f.Precip)
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, ", "), nil
}

// Items are a to-do list's items of a status (needs_action, completed; "" all).
func (o *Observer) Items(ctx context.Context, id, status string) ([]string, error) {
	data := map[string]any{"entity_id": id}
	if status != "" {
		data["status"] = []string{status}
	}
	r, err := o.C.Service(ctx, "todo", "get_items", data, true)
	if err != nil {
		return nil, err
	}
	var x struct {
		Items []struct {
			Summary string `json:"summary"`
			Due     string `json:"due"`
		} `json:"items"`
	}
	if err := json.Unmarshal(r[id], &x); err != nil {
		return nil, err
	}
	var out []string
	for _, it := range x.Items {
		s := it.Summary
		if it.Due != "" {
			s += " (due " + it.Due + ")"
		}
		out = append(out, s)
	}
	return out, nil
}

// Events are a calendar's events from now on, within the window, in words.
func (o *Observer) Events(ctx context.Context, id string, window time.Duration, n int) ([]string, error) {
	now := o.Now()
	r, err := o.C.Service(ctx, "calendar", "get_events", map[string]any{"entity_id": id,
		"start_date_time": now.Format(time.RFC3339), "end_date_time": now.Add(window).Format(time.RFC3339)}, true)
	if err != nil {
		return nil, err
	}
	var x struct {
		Events []struct {
			Start    string `json:"start"`
			Summary  string `json:"summary"`
			Location string `json:"location"`
		} `json:"events"`
	}
	if err := json.Unmarshal(r[id], &x); err != nil {
		return nil, err
	}
	var out []string
	for i, e := range x.Events {
		if i >= n {
			break
		}
		when := e.Start
		if t, err := time.Parse(time.RFC3339, e.Start); err == nil {
			when = t.Local().Format("Mon 15:04")
		} else if t, err := time.Parse("2006-01-02", e.Start); err == nil {
			when = t.Format("Mon") + " (all day)"
		}
		s := when + " " + e.Summary
		if e.Location != "" {
			s += " at " + e.Location
		}
		out = append(out, s)
	}
	return out, nil
}

// locationLine words the home's location: the place (when Home Assistant's location name is one,
// not the default "Home"), the coordinates, country, time zone, units and currency.
func locationLine(st semhome.HAState) string {
	a := st.Attributes
	f := func(k string) string { v, _ := a[k].(string); return v }
	lat, _ := num(a["latitude"])
	lon, _ := num(a["longitude"])
	ns, ew := "N", "E"
	if lat < 0 {
		ns, lat = "S", -lat
	}
	if lon < 0 {
		ew, lon = "W", -lon
	}
	where := fmt.Sprintf("%.2f %s, %.2f %s", lat, ns, lon, ew)
	if n := strings.TrimSpace(st.State); n != "" && !strings.EqualFold(n, "home") {
		where = n + ", " + where
	}
	s := "the home: " + where
	if c := f("country"); c != "" {
		s += ", country " + c
	}
	if tz := f("time_zone"); tz != "" {
		s += ", time zone " + tz
	}
	if e, ok := num(a["elevation"]); ok && e != 0 {
		s += fmt.Sprintf(", %.0f m up", e)
	}
	var u []string
	for _, k := range []string{"temperature_unit", "length_unit", "currency", "language"} {
		if v := f(k); v != "" {
			u = append(u, v)
		}
	}
	if len(u) > 0 {
		s += "; " + strings.Join(u, ", ")
	}
	return s
}
