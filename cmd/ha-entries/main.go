// ha-entries lists Home Assistant's config entries with their state, and disables or enables one
// by domain (reversible, unlike deleting it). The user, 2026-11-24: the Pi starts too slowly; the
// integrations Nina never uses (Bluetooth, go2rtc) are disabled rather than removed.
//
//	go run ./cmd/ha-entries [-url URL]                   every entry: domain, title, state
//	go run ./cmd/ha-entries -disable bluetooth,go2rtc     disabled by the user
//	go run ./cmd/ha-entries -enable bluetooth             back
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

type conn struct {
	c  *websocket.Conn
	id int
}

func (k *conn) call(cmd map[string]any, out any) error {
	k.id++
	cmd["id"] = k.id
	if err := k.c.WriteJSON(cmd); err != nil {
		return err
	}
	for {
		var r struct {
			ID      int             `json:"id"`
			Type    string          `json:"type"`
			Success bool            `json:"success"`
			Result  json.RawMessage `json:"result"`
			Error   any             `json:"error"`
		}
		if err := k.c.ReadJSON(&r); err != nil {
			return err
		}
		if r.Type != "result" || r.ID != k.id {
			continue
		}
		if !r.Success {
			return fmt.Errorf("%v: %v", cmd["type"], r.Error)
		}
		if out != nil {
			return json.Unmarshal(r.Result, out)
		}
		return nil
	}
}

func main() {
	url := flag.String("url", "http://homeassistant.local:8123", "Home Assistant")
	token := flag.String("token", "~/.config/fsttm/hass.token", "the token's file")
	disable := flag.String("disable", "", "domains to disable (comma-separated)")
	enable := flag.String("enable", "", "domains to enable again")
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
	k := &conn{c: c}
	var entries []struct {
		ID       string  `json:"entry_id"`
		Domain   string  `json:"domain"`
		Title    string  `json:"title"`
		State    string  `json:"state"`
		Disabled *string `json:"disabled_by"`
	}
	if err := k.call(map[string]any{"type": "config_entries/get"}, &entries); err != nil {
		log.Fatal(err)
	}
	set := func(list string, by any) {
		for _, d := range strings.Split(list, ",") {
			for _, e := range entries {
				if e.Domain == strings.TrimSpace(d) {
					if err := k.call(map[string]any{"type": "config_entries/disable", "entry_id": e.ID, "disabled_by": by}, nil); err != nil {
						log.Fatal(err)
					}
					fmt.Printf("%s (%s): disabled_by %v\n", e.Domain, e.Title, by)
				}
			}
		}
	}
	if *disable != "" {
		set(*disable, "user")
	}
	if *enable != "" {
		set(*enable, nil)
	}
	if *disable != "" || *enable != "" {
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Domain < entries[j].Domain })
	for _, e := range entries {
		by := ""
		if e.Disabled != nil {
			by = "disabled by " + *e.Disabled
		}
		fmt.Printf("%-18s %-14s %-30s %s\n", e.Domain, e.State, e.Title, by)
	}
}
