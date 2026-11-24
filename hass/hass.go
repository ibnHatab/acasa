// Package hass is the home's Home Assistant, as Nina's tool: its websocket followed into the
// semantic world's events (Follow), and its REST services as the device the home's rules
// command (Device). Nina (nina-live) owns the event log; this package only turns Home
// Assistant's states into events and the rules' commands into service calls.
package hass

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// Client is one Home Assistant: its base URL (http://127.0.0.1:8123) and a long-lived token.
type Client struct {
	URL   string
	Token string
	HTTP  *http.Client
}

// New reads the token from tokenFile (~/ expanded; the token never in a config).
func New(url, tokenFile string) (*Client, error) {
	if strings.HasPrefix(tokenFile, "~/") {
		h, _ := os.UserHomeDir()
		tokenFile = filepath.Join(h, tokenFile[2:])
	}
	b, err := os.ReadFile(tokenFile)
	if err != nil {
		return nil, fmt.Errorf("hass: the token: %w", err)
	}
	return &Client{URL: strings.TrimRight(url, "/"), Token: strings.TrimSpace(string(b)),
		HTTP: &http.Client{Timeout: 6 * time.Second}}, nil
}

// Call is one REST call; a non-2xx answer is an error.
func (c *Client) Call(method, path string, body any) (json.RawMessage, error) {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.URL+path, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("HTTP %d %s: %.200s", resp.StatusCode, path, b)
	}
	return b, nil
}

// ErrAuth: Home Assistant refused the token (Follow stops: retrying will not help).
var ErrAuth = errors.New("Home Assistant refused the token")

// Apply is where the feed's events go: Nina's world, which logs then applies them.
type Apply func(semhome.Event) (semhome.Out, error)

// Follow keeps the world fed until ctx ends: auth, get_states, state_changed, each state an
// ha_state event at now(); a lost connection is a feed_down event, then a reconnection with
// backoff. It returns ErrAuth if the token is refused.
func (c *Client) Follow(ctx context.Context, apply Apply, now func() float64) error {
	wait := time.Second
	for ctx.Err() == nil {
		t0 := time.Now()
		err := c.follow(ctx, apply, now)
		apply(semhome.Event{At: now(), Kind: "feed_down"})
		if errors.Is(err, ErrAuth) {
			return err
		}
		if ctx.Err() != nil {
			return nil
		}
		if time.Since(t0) > time.Minute {
			wait = time.Second
		}
		log.Printf("[hass] %v; again in %.0f s", err, wait.Seconds())
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(wait):
		}
		if wait *= 2; wait > 30*time.Second {
			wait = 30 * time.Second
		}
	}
	return nil
}

type msg struct {
	ID        int             `json:"id"`
	Type      string          `json:"type"`
	Message   string          `json:"message"`
	HAVersion string          `json:"ha_version"`
	Result    json.RawMessage `json:"result"`
	Event     struct {
		Data struct {
			NewState *semhome.HAState `json:"new_state"`
		} `json:"data"`
	} `json:"event"`
}

func (c *Client) wsURL() string {
	u := strings.Replace(strings.Replace(c.URL, "https://", "wss://", 1), "http://", "ws://", 1)
	return u + "/api/websocket"
}

func (c *Client) follow(ctx context.Context, apply Apply, now func() float64) error {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, c.wsURL(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	go func() { <-ctx.Done(); conn.Close() }()
	conn.SetReadLimit(1 << 24)
	recv := func() (msg, error) {
		var m msg
		err := conn.ReadJSON(&m)
		return m, err
	}
	hello, err := recv()
	if err != nil {
		return err
	}
	if hello.Type != "auth_required" {
		return fmt.Errorf("unexpected greeting: %s", hello.Type)
	}
	if err := conn.WriteJSON(map[string]string{"type": "auth", "access_token": c.Token}); err != nil {
		return err
	}
	ok, err := recv()
	if err != nil {
		return err
	}
	if ok.Type != "auth_ok" {
		return fmt.Errorf("%w: %s", ErrAuth, ok.Message)
	}
	if err := conn.WriteJSON(map[string]any{"id": 1, "type": "get_states"}); err != nil {
		return err
	}
	if err := conn.WriteJSON(map[string]any{"id": 2, "type": "subscribe_events", "event_type": "state_changed"}); err != nil {
		return err
	}
	log.Printf("[hass] connected to %s (Home Assistant %s)", c.URL, ok.HAVersion)
	for {
		m, err := recv()
		if err != nil {
			return err
		}
		switch {
		case m.ID == 1 && m.Type == "result":
			var states []semhome.HAState
			_ = json.Unmarshal(m.Result, &states)
			at := now()
			for i := range states {
				apply(semhome.Event{At: at, Kind: "ha_state", HA: &states[i]})
			}
		case m.Type == "event":
			if st := m.Event.Data.NewState; st != nil {
				apply(semhome.Event{At: now(), Kind: "ha_state", HA: st})
			}
		}
	}
}
