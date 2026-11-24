// ha-ui applies Nina's look and feel to Home Assistant from acasa/ha-ui (the user, 2026-11-24:
// keep the configuration in our repository, don't fork the original ones). It is idempotent:
//
//		go run ./cmd/ha-ui                      everything below
//		go run ./cmd/ha-ui -kiosk               and point the Pi's kiosk at Nina's dashboard
//
//	  - vendor.yaml: the third-party frontend modules, fetched from their releases, checked against
//	    their digests (cached in ~/.cache/acasa-ha-ui), copied to Home Assistant's www;
//	  - www/: our own modules (Nina's view, Nina's card), copied to www;
//	  - themes/: copied to the config's themes folder, reloaded, Nina's theme set as the default;
//	  - the resources: one per module, its ?v= the version or the file's digest (a change reloads);
//	  - dashboards/<name>.yaml: a storage dashboard at /<name>-panel, its config replaced;
//	  - kiosk/config.env (-kiosk): the Pi's /etc/ha-pi-kiosk/config.env, the kiosk restarted.
//
// Files reach the config over SSH (the Pi: nina@homeassistant.local, sudo); the rest is Home
// Assistant's websocket API with Nina's token.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"gopkg.in/yaml.v3"
)

var (
	dir    = flag.String("dir", "ha-ui", "the look and feel (acasa/ha-ui)")
	haURL  = flag.String("url", "http://homeassistant.local:8123", "Home Assistant")
	token  = flag.String("token", "~/.config/fsttm/hass.token", "the token's file")
	host   = flag.String("ssh", "", "the machine Home Assistant's config is on (\"\": this one; the Pi: nina@homeassistant.local)")
	config = flag.String("config", "~/homeassistant/config", "Home Assistant's config folder there (the Pi: /home/nina/homeassistant/config)")
	kiosk  = flag.Bool("kiosk", false, "also write the Pi's kiosk config and restart the kiosk")
)

func expand(p string) string {
	if strings.HasPrefix(p, "~/") {
		h, _ := os.UserHomeDir()
		return filepath.Join(h, p[2:])
	}
	return p
}

type vendored struct {
	Name, Version, URL, SHA256, Path string
}

func digest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

// fetch is a pinned module: from the cache, or its release, checked against its digest.
func fetch(v vendored) ([]byte, error) {
	cache := filepath.Join(expand("~/.cache/acasa-ha-ui"), v.Name+"-"+v.Version+filepath.Ext(v.Path))
	if b, err := os.ReadFile(cache); err == nil && digest(b) == v.SHA256 {
		return b, nil
	}
	resp, err := http.Get(v.URL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if got := digest(b); got != v.SHA256 {
		return nil, fmt.Errorf("%s %s: digest %s, pinned %s", v.Name, v.Version, got, v.SHA256)
	}
	os.MkdirAll(filepath.Dir(cache), 0o755)
	os.WriteFile(cache, b, 0o644)
	return b, nil
}

// put writes a file on the config's machine (sudo: the config belongs to the container's root).
func put(path string, b []byte) error {
	cmd := exec.Command("sudo", "install", "-D", "-m", "644", "/dev/stdin", path)
	if *host != "" {
		cmd = exec.Command("ssh", "-o", "BatchMode=yes", *host, fmt.Sprintf("sudo install -D -m 644 /dev/stdin %q", path))
	}
	cmd.Stdin = bytes.NewReader(b)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %v %s", path, err, out)
	}
	return nil
}

// ha is Home Assistant's websocket API.
type ha struct {
	c  *websocket.Conn
	id int
}

func dial() (*ha, error) {
	tok, err := os.ReadFile(expand(*token))
	if err != nil {
		return nil, err
	}
	u := strings.Replace(strings.Replace(*haURL, "https://", "wss://", 1), "http://", "ws://", 1) + "/api/websocket"
	c, _, err := websocket.DefaultDialer.Dial(u, nil)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	c.ReadJSON(&m)
	c.WriteJSON(map[string]any{"type": "auth", "access_token": strings.TrimSpace(string(tok))})
	if err := c.ReadJSON(&m); err != nil || m["type"] != "auth_ok" {
		return nil, fmt.Errorf("auth: %v %v", m, err)
	}
	return &ha{c: c}, nil
}

func (h *ha) call(cmd map[string]any) (json.RawMessage, error) {
	h.id++
	cmd["id"] = h.id
	if err := h.c.WriteJSON(cmd); err != nil {
		return nil, err
	}
	for {
		var r struct {
			ID      int             `json:"id"`
			Type    string          `json:"type"`
			Success bool            `json:"success"`
			Result  json.RawMessage `json:"result"`
			Error   any             `json:"error"`
		}
		if err := h.c.ReadJSON(&r); err != nil {
			return nil, err
		}
		if r.Type != "result" || r.ID != h.id {
			continue
		}
		if !r.Success {
			return nil, fmt.Errorf("%v: %v", cmd["type"], r.Error)
		}
		return r.Result, nil
	}
}

// resource registers url (its path before ?), replacing one of the same path.
func (h *ha) resource(url string) error {
	raw, err := h.call(map[string]any{"type": "lovelace/resources"})
	if err != nil {
		return err
	}
	var rs []struct{ ID, URL, Type string }
	json.Unmarshal(raw, &rs)
	path, _, _ := strings.Cut(url, "?")
	for _, r := range rs {
		if p, _, _ := strings.Cut(r.URL, "?"); p == path {
			if r.URL == url {
				return nil
			}
			_, err := h.call(map[string]any{"type": "lovelace/resources/update", "resource_id": r.ID, "res_type": "module", "url": url})
			return err
		}
	}
	_, err = h.call(map[string]any{"type": "lovelace/resources/create", "res_type": "module", "url": url})
	return err
}

// dashboard puts a storage dashboard at url_path and replaces its config.
func (h *ha) dashboard(urlPath, title, icon string, conf any) error {
	raw, err := h.call(map[string]any{"type": "lovelace/dashboards/list"})
	if err != nil {
		return err
	}
	var ds []struct {
		ID      string `json:"id"`
		URLPath string `json:"url_path"`
		Sidebar bool   `json:"show_in_sidebar"`
	}
	json.Unmarshal(raw, &ds)
	sidebar := !strings.HasSuffix(urlPath, "-side") // the side dashboard is framed, never browsed
	found := false
	for _, d := range ds {
		if d.URLPath != urlPath {
			continue
		}
		found = true
		if d.Sidebar != sidebar {
			if _, err := h.call(map[string]any{"type": "lovelace/dashboards/update", "dashboard_id": d.ID, "show_in_sidebar": sidebar}); err != nil {
				return err
			}
		}
	}
	if !found {
		if _, err := h.call(map[string]any{"type": "lovelace/dashboards/create", "url_path": urlPath, "title": title,
			"icon": icon, "show_in_sidebar": sidebar, "require_admin": false, "mode": "storage"}); err != nil {
			return err
		}
	}
	_, err = h.call(map[string]any{"type": "lovelace/config/save", "url_path": urlPath, "config": conf})
	return err
}

// sideOf is a dashboard without Nina's card: each view whose first card is a horizontal stack
// beginning with custom:nina-card keeps the rest of the stack (Nina's own screen shows her card
// itself, beside the dashboard). false: no view has her card.
func sideOf(conf map[string]any) (map[string]any, bool) {
	b, _ := json.Marshal(conf) // a deep copy
	var side map[string]any
	json.Unmarshal(b, &side)
	views, _ := side["views"].([]any)
	found := false
	for _, v := range views {
		view, _ := v.(map[string]any)
		cards, _ := view["cards"].([]any)
		if len(cards) == 0 {
			continue
		}
		hs, _ := cards[0].(map[string]any)
		inner, _ := hs["cards"].([]any)
		if hs["type"] != "horizontal-stack" || len(inner) < 2 {
			continue
		}
		if first, _ := inner[0].(map[string]any); first["type"] != "custom:nina-card" {
			continue
		}
		found = true
		if len(inner) == 2 {
			view["cards"] = []any{inner[1]}
		} else {
			view["cards"] = []any{map[string]any{"type": "horizontal-stack", "cards": inner[1:]}}
		}
	}
	return side, found
}

func main() {
	flag.Parse()
	log.SetFlags(0)
	d := *dir
	if *host == "" {
		*config = expand(*config)
	}
	h, err := dial()
	if err != nil {
		log.Fatal(err)
	}
	defer h.c.Close()

	// the pinned third-party modules
	var vs []vendored
	b, err := os.ReadFile(filepath.Join(d, "vendor.yaml"))
	if err != nil {
		log.Fatal(err)
	}
	if err := yaml.Unmarshal(b, &vs); err != nil {
		log.Fatal(err)
	}
	var urls []string
	for _, v := range vs {
		js, err := fetch(v)
		if err != nil {
			log.Fatal(err)
		}
		if err := put(filepath.Join(*config, "www", v.Path), js); err != nil {
			log.Fatal(err)
		}
		urls = append(urls, "/local/"+v.Path+"?v="+v.Version)
		log.Printf("module %s %s", v.Name, v.Version)
	}

	// our own modules (www/), versioned by their contents
	err = filepath.Walk(filepath.Join(d, "www"), func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(filepath.Join(d, "www"), p)
		if err := put(filepath.Join(*config, "www", rel), b); err != nil {
			return err
		}
		if strings.HasSuffix(p, ".js") {
			urls = append(urls, "/local/"+rel+"?v="+digest(b)[:10])
		}
		log.Printf("ours %s", rel)
		return nil
	})
	if err != nil {
		log.Fatal(err)
	}
	sort.Strings(urls)
	for _, u := range urls {
		if err := h.resource(u); err != nil {
			log.Fatalf("resource %s: %v", u, err)
		}
	}

	// themes
	themes, _ := filepath.Glob(filepath.Join(d, "themes", "*.yaml"))
	for _, t := range themes {
		b, _ := os.ReadFile(t)
		if err := put(filepath.Join(*config, "themes", filepath.Base(t)), b); err != nil {
			log.Fatal(err)
		}
	}
	if len(themes) > 0 {
		if _, err := h.call(map[string]any{"type": "call_service", "domain": "frontend", "service": "reload_themes"}); err != nil {
			log.Fatal(err)
		}
		time.Sleep(time.Second)
		if _, err := h.call(map[string]any{"type": "call_service", "domain": "frontend", "service": "set_theme",
			"service_data": map[string]any{"name": "Nina"}}); err != nil {
			log.Printf("set_theme: %v", err)
		}
		log.Printf("themes: %d, Nina's the default", len(themes))
	}

	// dashboards
	dbs, _ := filepath.Glob(filepath.Join(d, "dashboards", "*.yaml"))
	for _, f := range dbs {
		b, _ := os.ReadFile(f)
		var conf map[string]any
		if err := yaml.Unmarshal(b, &conf); err != nil {
			log.Fatalf("%s: %v", f, err)
		}
		for k := range conf { // x-…: the YAML's own (anchors' holders), not the dashboard's
			if strings.HasPrefix(k, "x-") {
				delete(conf, k)
			}
		}
		name := strings.TrimSuffix(filepath.Base(f), ".yaml")
		title, _ := conf["title"].(string)
		if err := h.dashboard(name+"-panel", title, "mdi:home-heart", conf); err != nil {
			log.Fatalf("dashboard %s: %v", name, err)
		}
		log.Printf("dashboard /%s-panel", name)
		if side, ok := sideOf(conf); ok { // the right half of Nina's own screen (shell.html): Nina's card taken out
			if err := h.dashboard(name+"-side", title+" (side)", "mdi:page-layout-sidebar-right", side); err != nil {
				log.Fatalf("dashboard %s-side: %v", name, err)
			}
			log.Printf("dashboard /%s-side", name)
		}
	}

	// the Pi's kiosk
	if *kiosk {
		b, err := os.ReadFile(filepath.Join(d, "kiosk", "config.env"))
		if err != nil {
			log.Fatal(err)
		}
		if err := put("/etc/ha-pi-kiosk/config.env", b); err != nil {
			log.Fatal(err)
		}
		if *host == "" {
			log.Fatal("-kiosk is the Pi's: give -ssh nina@homeassistant.local")
		}
		out, err := exec.Command("ssh", "-o", "BatchMode=yes", *host, "pkill -x firefox || pkill -x firefox-esr || true").CombinedOutput()
		if err != nil {
			log.Printf("the kiosk's restart: %v %s", err, out)
		}
		log.Printf("kiosk: config written, Firefox restarted")
	}
}
