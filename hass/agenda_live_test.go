package hass

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ibnHatab/nina-live/agenda"
)

// TestAgendaWritesReachHomeAssistant: on the real Home Assistant (NINA_LIVE_HA=1), the agenda's Home
// Assistant backend puts an event on the local test calendar and a to-do on the local list, marked as
// Nina's; the to-do is removed after (moved from nina-live's agenda, the redesign's step 1).
func TestAgendaWritesReachHomeAssistant(t *testing.T) {
	if os.Getenv("NINA_LIVE_HA") == "" {
		t.Skip("NINA_LIVE_HA=1 writes to the local test calendar and list")
	}
	c, err := New("http://homeassistant.local:8123", "~/.config/fsttm/hass.token")
	if err != nil {
		t.Fatal(err)
	}
	be := agenda.HA{Call: func(ctx context.Context, d, s string, data map[string]any) error {
		_, err := c.Service(ctx, d, s, data, false)
		return err
	}}
	start := time.Now().Add(2 * time.Hour).Truncate(time.Minute)
	ctx := context.Background()
	if err := be.CreateEvent(ctx, "calendar.nina_local", "Nina's write check", start.Format("2006-01-02 15:04:05"),
		start.Add(15*time.Minute).Format("2006-01-02 15:04:05"), agenda.Mark); err != nil {
		t.Fatal(err)
	}
	if err := be.AddItem(ctx, "todo.nina_local", "Nina's write check", "", agenda.Mark); err != nil {
		t.Fatal(err)
	}
	r, err := c.Service(ctx, "calendar", "get_events", map[string]any{"entity_id": "calendar.nina_local",
		"start_date_time": start.Add(-time.Minute).Format(time.RFC3339), "end_date_time": start.Add(time.Hour).Format(time.RFC3339)}, true)
	if err != nil || !strings.Contains(string(r["calendar.nina_local"]), "Nina's write check") || !strings.Contains(string(r["calendar.nina_local"]), agenda.Mark) {
		t.Fatalf("the event: %s %v", r["calendar.nina_local"], err)
	}
	r, err = c.Service(ctx, "todo", "get_items", map[string]any{"entity_id": "todo.nina_local"}, true)
	var x struct {
		Items []struct{ Summary, Description string }
	}
	json.Unmarshal(r["todo.nina_local"], &x)
	found := false
	for _, it := range x.Items {
		found = found || (it.Summary == "Nina's write check" && it.Description == agenda.Mark)
	}
	if err != nil || !found {
		t.Fatalf("the to-do: %s %v", r["todo.nina_local"], err)
	}
	if _, err := c.Service(ctx, "todo", "remove_item", map[string]any{"entity_id": "todo.nina_local", "item": "Nina's write check"}, false); err != nil {
		t.Fatal(err)
	}
}
