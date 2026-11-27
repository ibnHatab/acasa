package hass

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStatesOfBulkAndOne(t *testing.T) {
	var bulk map[string]any
	json.Unmarshal([]byte(`{"success":true,"count":2,"states":{"light.a":{"state":"on","attributes":{"brightness":3}},"fan.b_supply_fan":{"entity_id":"fan.b_supply_fan","state":"off"}}}`), &bulk)
	got := statesOf(bulk)
	if len(got) != 2 || got["light.a"].State != "on" || got["fan.b_supply_fan"].Attributes == nil {
		t.Fatalf("bulk: %+v", got)
	}
	var one map[string]any
	json.Unmarshal([]byte(`{"data":{"entity_id":"sun.sun","state":"above_horizon","attributes":{}}}`), &one)
	if got := statesOf(one); got["sun.sun"].State != "above_horizon" {
		t.Fatalf("one: %+v", got)
	}
}

func TestMapEntities(t *testing.T) {
	p := filepath.Join(t.TempDir(), "home.map.json")
	os.WriteFile(p, []byte(`{"lights":{"l1":{"entity":"light.lamp"},"l2":{"entity":null}},"units":{"u1":{"prefix":"bed"}},
		"tvs":{"t1":{"entity":"media_player.tv"}},"radar":{"r1":"binary_sensor.p","r2":null,"_note":"x"},
		"thermometers":{"r1":{"temperature":"sensor.t","humidity":""},"r2":null},"sun":"sun.sun"}`), 0o644)
	got, err := MapEntities(p, "sensor.nina_viewer")
	if err != nil {
		t.Fatal(err)
	}
	want := "binary_sensor.p fan.bed_extract_fan fan.bed_supply_fan light.lamp media_player.tv sensor.nina_viewer sensor.t sun.sun switch.bed_heater switch.bed_winter"
	if strings.Join(got, " ") != want {
		t.Fatalf("%v", got)
	}
}
