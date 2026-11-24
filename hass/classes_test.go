package hass

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// TestTheClassesOnTheRealHomeAssistant: the observer on Home Assistant's feed words every
// observed class's entity (ACASA_LIVE_HA=1: reads Pascal's Home Assistant, changes nothing).
func TestTheClassesOnTheRealHomeAssistant(t *testing.T) {
	if os.Getenv("ACASA_LIVE_HA") == "" {
		t.Skip("ACASA_LIVE_HA=1 reads the real Home Assistant")
	}
	c, err := New("http://homeassistant.local:8123", "~/.config/fsttm/hass.token")
	if err != nil {
		t.Fatal(err)
	}
	o := NewObserver(c)
	got := map[string]string{}
	o.OnLine = func(k, l string) { got[k] = l }
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	go c.Follow(ctx, o.Feed(func(semhome.Event) (semhome.Out, error) { return semhome.Out{}, nil }), func() float64 { return 0 })
	o.Run(ctx, time.Hour)
	for k, l := range got {
		t.Logf("%s → %s", k, l)
	}
	if !strings.HasPrefix(got["weather.home"], "weather (") || got["todo.shopping_list"] == "" {
		t.Fatalf("lines: %v", got)
	}
}

func TestLocationLine(t *testing.T) {
	st := semhome.HAState{EntityID: "location.home", State: "Home", Attributes: map[string]any{
		"latitude": 45.77, "longitude": 21.21, "elevation": 0.0, "time_zone": "Europe/Bucharest", "country": "RO",
		"language": "en", "currency": "RON", "temperature_unit": "°C", "length_unit": "km"}}
	got := locationLine(st)
	want := "the home: 45.77 N, 21.21 E, country RO, time zone Europe/Bucharest; °C, km, RON, en"
	if got != want {
		t.Fatalf("\\n got %q\\nwant %q", got, want)
	}
	st.State = "Timișoara"
	if got := locationLine(st); !strings.HasPrefix(got, "the home: Timișoara, 45.77 N") {
		t.Fatalf("a named place: %q", got)
	}
}
