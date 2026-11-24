// ha-startup prints Home Assistant's integration startup times, slowest first (what Settings →
// System → Repairs → ⋮ → Integration startup time shows: the websocket's integration/setup_info),
// and their sum. The user, 2026-11-24: the Pi's start is too slow; this is its systemd-analyze blame.
//
//	go run ./cmd/ha-startup [-url http://homeassistant.local:8123] [-n 25]
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gorilla/websocket"
)

func main() {
	url := flag.String("url", "http://homeassistant.local:8123", "Home Assistant")
	token := flag.String("token", "~/.config/fsttm/hass.token", "the token's file")
	n := flag.Int("n", 25, "how many to show")
	flag.Parse()
	log.SetFlags(0)
	tf := *token
	if strings.HasPrefix(tf, "~/") {
		h, _ := os.UserHomeDir()
		tf = filepath.Join(h, tf[2:])
	}
	tok, err := os.ReadFile(tf)
	if err != nil {
		log.Fatal(err)
	}
	ws := strings.Replace(strings.Replace(*url, "https://", "wss://", 1), "http://", "ws://", 1) + "/api/websocket"
	c, _, err := websocket.DefaultDialer.Dial(ws, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer c.Close()
	var m map[string]any
	c.ReadJSON(&m)
	c.WriteJSON(map[string]any{"type": "auth", "access_token": strings.TrimSpace(string(tok))})
	if err := c.ReadJSON(&m); err != nil || m["type"] != "auth_ok" {
		log.Fatalf("auth: %v %v", m, err)
	}
	c.WriteJSON(map[string]any{"id": 1, "type": "integration/setup_info"})
	var r struct {
		Success bool `json:"success"`
		Result  []struct {
			Domain  string  `json:"domain"`
			Seconds float64 `json:"seconds"`
		} `json:"result"`
		Error any `json:"error"`
	}
	for {
		var raw json.RawMessage
		if err := c.ReadJSON(&raw); err != nil {
			log.Fatal(err)
		}
		var h struct {
			ID   int    `json:"id"`
			Type string `json:"type"`
		}
		json.Unmarshal(raw, &h)
		if h.ID == 1 && h.Type == "result" {
			json.Unmarshal(raw, &r)
			break
		}
	}
	if !r.Success {
		log.Fatalf("integration/setup_info: %v", r.Error)
	}
	sort.Slice(r.Result, func(i, j int) bool { return r.Result[i].Seconds > r.Result[j].Seconds })
	sum := 0.0
	for _, x := range r.Result {
		sum += x.Seconds
	}
	fmt.Printf("%d integrations, %.1f s in all (they start in parallel: the slowest bound the start)\n", len(r.Result), sum)
	for i, x := range r.Result {
		if i == *n {
			break
		}
		fmt.Printf("%7.2f s  %s\n", x.Seconds, x.Domain)
	}
}
