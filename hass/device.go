package hass

import (
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	semhome "github.com/metis-lang-dev/metis-worlds/libs/semantic-world/go/home"
)

// Device carries the home's rules' commands to Home Assistant's services: the lights and the
// TV by their entities, the Prana units by their prefixes (the home map). It is the rules'
// effector; the command's prediction is already in the world (the host writes it first).
//
// The Prana units, learnt on Pascal (2026-11-22):
//   - one fan per call, never both in one: Home Assistant runs a call's entities at once, the
//     unit's small HTTP server drops the second request (500 "Server disconnected"), and a bound
//     unit (boost binds its fans) gets the command twice; a dropped call is retried once;
//   - a preset (night, boost) is the unit's switch: set once, through the supply fan;
//   - normal: Home Assistant can set a preset but not clear one; a stop clears it, so off, on;
//   - a boost goes back to normal after BoostMax: boost air is cold air.
type Device struct {
	C        *Client
	M        *semhome.Map
	BoostMax time.Duration // 0: no limit

	mu    sync.Mutex
	boost map[string]*time.Timer
}

// NewDevice is the device over c with the home map m; BoostMax from METIS_HOME_BOOST_MAX (a
// duration; default 10 minutes).
func NewDevice(c *Client, m *semhome.Map) *Device {
	d := &Device{C: c, M: m, BoostMax: 10 * time.Minute}
	if v := os.Getenv("METIS_HOME_BOOST_MAX"); v != "" {
		if x, err := time.ParseDuration(v); err == nil {
			d.BoostMax = x
		}
	}
	return d
}

var errNoEntity = fmt.Errorf("no entity")

// Do is one command: kind light | tv | unit, the role (l1, t1, u2), the op (on, off, louder,
// quieter, preset, heater, winter) and its value. → whether Home Assistant took it.
func (d *Device) Do(kind, role, op string, value any) bool {
	err := d.do(kind, role, op, value)
	if err != nil {
		if err != errNoEntity {
			log.Printf("[hass] %s %s %s: %v", kind, role, op, err)
		}
		return false
	}
	return true
}

func (d *Device) do(kind, role, op string, value any) error {
	switch kind {
	case "light", "tv":
		var e *string
		if kind == "light" {
			e = d.M.Lights[role].Entity
		} else {
			e = d.M.TVs[role].Entity
		}
		if e == nil || *e == "" {
			return errNoEntity
		}
		svc := map[string]string{"on": "turn_on", "off": "turn_off", "louder": "volume_up", "quieter": "volume_down"}[op]
		if svc == "" {
			return fmt.Errorf("no %s op %q", kind, op)
		}
		_, err := d.C.Call("POST", "/api/services/"+strings.SplitN(*e, ".", 2)[0]+"/"+svc, map[string]any{"entity_id": *e})
		return err
	case "unit":
		u, ok := d.M.Units[role]
		if !ok || u.Prefix == "" {
			return errNoEntity
		}
		sup, ext := "fan."+u.Prefix+"_supply_fan", "fan."+u.Prefix+"_extract_fan"
		fan := func(svc, e string, extra map[string]any) error {
			body := map[string]any{"entity_id": e}
			for k, v := range extra {
				body[k] = v
			}
			_, err := d.C.Call("POST", "/api/services/fan/"+svc, body)
			if err != nil {
				log.Printf("[hass] %s %s: %v; once more", svc, e, err)
				time.Sleep(time.Second)
				_, err = d.C.Call("POST", "/api/services/fan/"+svc, body)
			}
			return err
		}
		both := func(svc string) error {
			if err := fan(svc, sup, nil); err != nil {
				return err
			}
			return fan(svc, ext, nil)
		}
		switch op {
		case "on", "off":
			d.boostEnd(role)
			return both("turn_" + op)
		case "preset":
			if v, _ := value.(string); v == "night" || v == "boost" {
				if err := fan("set_preset_mode", sup, map[string]any{"preset_mode": v}); err != nil {
					return err
				}
				if v == "boost" {
					d.boostFor(role)
				} else {
					d.boostEnd(role)
				}
				return nil
			}
			d.boostEnd(role)
			if err := both("turn_off"); err != nil {
				return err
			}
			return both("turn_on")
		case "heater", "winter":
			on, _ := value.(bool)
			svc := "turn_off"
			if on {
				svc = "turn_on"
			}
			_, err := d.C.Call("POST", "/api/services/switch/"+svc, map[string]any{"entity_id": "switch." + u.Prefix + "_" + op})
			return err
		}
		return fmt.Errorf("no unit op %q", op)
	}
	return fmt.Errorf("no device kind %q", kind)
}

func (d *Device) boostFor(role string) {
	if d.BoostMax <= 0 {
		return
	}
	d.boostEnd(role)
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.boost == nil {
		d.boost = map[string]*time.Timer{}
	}
	d.boost[role] = time.AfterFunc(d.BoostMax, func() {
		log.Printf("[hass] %s: boost for %s: back to normal", role, d.BoostMax)
		d.Do("unit", role, "preset", "normal")
	})
}

func (d *Device) boostEnd(role string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if t := d.boost[role]; t != nil {
		t.Stop()
		delete(d.boost, role)
	}
}
