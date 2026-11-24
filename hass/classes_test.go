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
	c, err := New("http://127.0.0.1:8123", "~/.config/fsttm/hass.token")
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
