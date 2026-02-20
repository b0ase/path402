// Package mobile provides gomobile-bindable functions for the ClawMiner daemon.
// All complex data is returned as JSON strings since gomobile cannot export
// maps, slices, or structs with unexported fields.
package mobile

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/daemon"

	// Required by gomobile bind at build time
	_ "golang.org/x/mobile/bind"
)

var (
	mu      sync.Mutex
	d       *daemon.Daemon
	running bool
	apiPort int
	version = "0.1.0"
)

// Start initialises and starts the ClawMiner daemon.
// configYAML may be empty to use defaults. dataDir is the path to the app's
// private files directory (e.g. Context.getFilesDir() + "/clawminer").
func Start(configYAML string, dataDir string) error {
	mu.Lock()
	defer mu.Unlock()

	if running {
		return fmt.Errorf("already running")
	}

	cfg, err := config.LoadFromBytes([]byte(configYAML))
	if err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	if dataDir != "" {
		cfg.DataDir = dataDir
	}
	// On mobile, bind to all interfaces so the API is reachable from localhost
	cfg.API.Bind = "0.0.0.0"

	d, err = daemon.New(cfg)
	if err != nil {
		return fmt.Errorf("create daemon: %w", err)
	}
	if err := d.Start(); err != nil {
		d = nil
		return fmt.Errorf("start daemon: %w", err)
	}

	running = true
	return nil
}

// Stop gracefully shuts down the daemon.
func Stop() {
	mu.Lock()
	defer mu.Unlock()

	if d != nil {
		d.Stop()
		d = nil
	}
	running = false
}

// IsRunning returns true if the daemon is currently running.
func IsRunning() bool {
	mu.Lock()
	defer mu.Unlock()
	return running
}

// GetStatus returns full daemon status as a JSON string.
func GetStatus() string {
	mu.Lock()
	defer mu.Unlock()

	if d == nil {
		return `{"running":false}`
	}

	status := map[string]interface{}{
		"running":   true,
		"node_id":   d.NodeID(),
		"uptime_ms": d.Uptime().Milliseconds(),
		"peers":     d.PeerCount(),
		"mining":    d.MiningStatus(),
		"headers":   d.HeaderSyncStatus(),
	}

	data, _ := json.Marshal(status)
	return string(data)
}

// GetMiningStatus returns mining status as a JSON string.
func GetMiningStatus() string {
	mu.Lock()
	defer mu.Unlock()

	if d == nil {
		return `{"enabled":false}`
	}
	data, _ := json.Marshal(d.MiningStatus())
	return string(data)
}

// GetHeaderSyncStatus returns header sync status as a JSON string.
func GetHeaderSyncStatus() string {
	mu.Lock()
	defer mu.Unlock()

	if d == nil {
		return `{"enabled":false}`
	}
	data, _ := json.Marshal(d.HeaderSyncStatus())
	return string(data)
}

// GetAPIPort returns the port the HTTP API is listening on.
func GetAPIPort() int {
	return apiPort
}

// GetVersion returns the ClawMiner version string.
func GetVersion() string {
	return version
}
