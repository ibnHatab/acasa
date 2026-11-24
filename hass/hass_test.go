package hass

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// fakeHA records the service calls; the first `fail` calls answer 500, as the Prana's server does.
type fakeHA struct {
	mu    sync.Mutex
	calls []string
	fail  int
}

func (f *fakeHA) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	json.NewDecoder(r.Body).Decode(&body)
	f.mu.Lock()
	defer f.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer t0k" {
		http.Error(w, "no", 401)
		return
	}
	if f.fail > 0 {
		f.fail--
		http.Error(w, "Server disconnected", 500)
		return
	}
	c := strings.TrimPrefix(r.URL.Path, "/api/services/") + " " + body["entity_id"].(string)
	if p, ok := body["preset_mode"]; ok {
		c += " " + p.(string)
	}
	f.calls = append(f.calls, c)
	w.Write([]byte("[]"))
}

func (f *fakeHA) took() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	c := f.calls
	f.calls = nil
	return c
}

func device(t *testing.T, f *fakeHA) *Device {
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	m, err := semhome.LoadMap("testdata/home.wired.map.json")
	if err != nil {
		t.Fatal(err)
	}
	d := NewDevice(&Client{URL: srv.URL, Token: "t0k", HTTP: srv.Client()}, m)
	d.BoostMax = 200 * time.Millisecond
	return d
}

// TestThePranaOneFanAtATime: on/off one fan per call (a dropped call retried), a preset once,
// normal as off then on, a boost back to normal after BoostMax unless the unit was stopped.
func TestThePranaOneFanAtATime(t *testing.T) {
	f := &fakeHA{fail: 1}
	d := device(t, f)
	want := func(what string, w ...string) {
		t.Helper()
		if got := f.took(); !reflect.DeepEqual(got, w) {
			t.Fatalf("%s: %q, want %q", what, got, w)
		}
	}
	if !d.Do("unit", "u2", "off", nil) {
		t.Fatal("off refused")
	}
	want("off", "fan/turn_off fan.lab_supply_fan", "fan/turn_off fan.lab_extract_fan")
	d.Do("unit", "u2", "preset", "night")
	want("night", "fan/set_preset_mode fan.lab_supply_fan night")
	d.Do("unit", "u2", "preset", "normal")
	want("normal", "fan/turn_off fan.lab_supply_fan", "fan/turn_off fan.lab_extract_fan",
		"fan/turn_on fan.lab_supply_fan", "fan/turn_on fan.lab_extract_fan")
	d.Do("unit", "u2", "preset", "boost")
	want("boost", "fan/set_preset_mode fan.lab_supply_fan boost")
	time.Sleep(350 * time.Millisecond)
	want("the boost's end", "fan/turn_off fan.lab_supply_fan", "fan/turn_off fan.lab_extract_fan",
		"fan/turn_on fan.lab_supply_fan", "fan/turn_on fan.lab_extract_fan")
	d.Do("unit", "u2", "preset", "boost")
	d.Do("unit", "u2", "off", nil)
	f.took()
	time.Sleep(350 * time.Millisecond)
	want("a stopped unit's boost")
	d.Do("unit", "u1", "heater", true)
	want("heater", "switch/turn_on switch.bedroom_badriom_heater")
	d.Do("light", "l3", "on", nil)
	want("light", "light/turn_on light.lab")
	if d.Do("light", "l1", "on", nil) {
		t.Fatal("a light not in Home Assistant was commanded")
	}
}

// TestFollowFeedsTheWorld: the websocket's states and events become ha_state events; a lost
// connection is a feed_down; a refused token stops the follow.
func TestFollowFeedsTheWorld(t *testing.T) {
	up := websocket.Upgrader{}
	token := "t0k"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		c.WriteJSON(map[string]string{"type": "auth_required"})
		var auth map[string]string
		c.ReadJSON(&auth)
		if auth["access_token"] != token {
			c.WriteJSON(map[string]string{"type": "auth_invalid", "message": "bad token"})
			return
		}
		c.WriteJSON(map[string]string{"type": "auth_ok", "ha_version": "test"})
		var req map[string]any
		c.ReadJSON(&req)
		c.ReadJSON(&req)
		c.WriteJSON(map[string]any{"id": 1, "type": "result", "result": []map[string]any{
			{"entity_id": "fan.lab_supply_fan", "state": "off"}, {"entity_id": "sun.sun", "state": "above_horizon"}}})
		c.WriteJSON(map[string]any{"id": 2, "type": "event", "event": map[string]any{"data": map[string]any{
			"new_state": map[string]any{"entity_id": "fan.lab_supply_fan", "state": "on"}}}})
		time.Sleep(100 * time.Millisecond) // then the connection drops
	}))
	defer srv.Close()
	var mu sync.Mutex
	var got []string
	apply := func(ev semhome.Event) (semhome.Out, error) {
		mu.Lock()
		defer mu.Unlock()
		s := ev.Kind
		if ev.HA != nil {
			s += " " + ev.HA.EntityID + "=" + ev.HA.State
		}
		got = append(got, s)
		return semhome.Out{}, nil
	}
	c := &Client{URL: srv.URL, Token: token, HTTP: srv.Client()}
	ctx, cancel := context.WithTimeout(context.Background(), 600*time.Millisecond)
	defer cancel()
	c.Follow(ctx, apply, func() float64 { return 1 })
	mu.Lock()
	first := append([]string(nil), got[:4]...)
	mu.Unlock()
	want := []string{"ha_state fan.lab_supply_fan=off", "ha_state sun.sun=above_horizon", "ha_state fan.lab_supply_fan=on", "feed_down"}
	if !reflect.DeepEqual(first, want) {
		t.Fatalf("events %q", first)
	}
	token = "other"
	if err := c.Follow(context.Background(), apply, func() float64 { return 2 }); err == nil || !strings.Contains(err.Error(), "refused") {
		t.Fatalf("a refused token: %v", err)
	}
}
