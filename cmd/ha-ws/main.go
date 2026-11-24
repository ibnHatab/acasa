// ha-ws sends one command to Home Assistant's websocket API and prints its result (for the
// settings only the websocket changes, e.g. the location's name).
//
//	go run ./cmd/ha-ws [-url URL] '{"type":"config/core/update","location_name":"Timișoara"}'
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"
)

func main() {
	url := flag.String("url", "http://homeassistant.local:8123", "Home Assistant")
	token := flag.String("token", "~/.config/fsttm/hass.token", "the token's file")
	flag.Parse()
	log.SetFlags(0)
	var cmd map[string]any
	if flag.NArg() != 1 || json.Unmarshal([]byte(flag.Arg(0)), &cmd) != nil || cmd["type"] == nil {
		log.Fatal(`usage: ha-ws [-url URL] '{"type":"…", …}'`)
	}
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
	cmd["id"] = 1
	c.WriteJSON(cmd)
	for {
		var r map[string]any
		if err := c.ReadJSON(&r); err != nil {
			log.Fatal(err)
		}
		if r["type"] == "result" {
			b, _ := json.Marshal(r)
			fmt.Println(string(b))
			if r["success"] != true {
				os.Exit(1)
			}
			return
		}
	}
}
