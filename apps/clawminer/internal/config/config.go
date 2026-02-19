package config

import (
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type GossipConfig struct {
	Port           int      `yaml:"port"`
	BootstrapPeers []string `yaml:"bootstrap_peers"`
	MaxPeers       int      `yaml:"max_peers"`
}

type APIConfig struct {
	Port int    `yaml:"port"`
	Bind string `yaml:"bind"`
}

type WalletConfig struct {
	Key string `yaml:"key"`
}

type MiningConfig struct {
	Enabled           bool          `yaml:"enabled"`
	Difficulty        int           `yaml:"difficulty"`
	HeartbeatInterval time.Duration `yaml:"heartbeat_interval"`
	MinItems          int           `yaml:"min_items"`
	BatchSize         int           `yaml:"batch_size"`
	TokenID           string        `yaml:"token_id"`
	MintEndpoint      string        `yaml:"mint_endpoint"`  // HTTP mint service URL (fallback)
	ArcURL            string        `yaml:"arc_url"`         // ARC broadcaster URL
	ArcAPIKey         string        `yaml:"arc_api_key"`     // ARC API key (optional)
	BroadcastMode     string        `yaml:"broadcast_mode"`  // "native", "http", or "none"
}

type LogConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

type Config struct {
	DataDir string       `yaml:"data_dir"`
	Gossip  GossipConfig `yaml:"gossip"`
	API     APIConfig    `yaml:"api"`
	Wallet  WalletConfig `yaml:"wallet"`
	Mining  MiningConfig `yaml:"mining"`
	Log     LogConfig    `yaml:"log"`
}

func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		DataDir: filepath.Join(home, ".clawminer"),
		Gossip: GossipConfig{
			Port:           4020,
			BootstrapPeers: []string{},
			MaxPeers:       50,
		},
		API: APIConfig{
			Port: 8402,
			Bind: "127.0.0.1",
		},
		Mining: MiningConfig{
			Enabled:           true,
			Difficulty:        3,
			HeartbeatInterval: 15 * time.Second,
			MinItems:          5,
			BatchSize:         10,
		},
		Log: LogConfig{
			Level:  "info",
			Format: "text",
		},
	}
}

// Load reads a YAML config file and merges it with defaults.
func Load(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file — use defaults + env overlay
			cfg.applyEnv()
			return cfg, nil
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	// Expand ~ in data_dir
	if len(cfg.DataDir) > 0 && cfg.DataDir[0] == '~' {
		home, _ := os.UserHomeDir()
		cfg.DataDir = filepath.Join(home, cfg.DataDir[1:])
	}

	cfg.applyEnv()
	return cfg, nil
}

// applyEnv overlays environment variables on top of config values.
func (c *Config) applyEnv() {
	if v := os.Getenv("CLAWMINER_WALLET_KEY"); v != "" {
		c.Wallet.Key = v
	}
	if v := os.Getenv("HTM_TOKEN_ID"); v != "" {
		c.Mining.TokenID = v
	}
	if v := os.Getenv("CLAWMINER_DATA_DIR"); v != "" {
		c.DataDir = v
	}
	if v := os.Getenv("CLAWMINER_MINT_ENDPOINT"); v != "" {
		c.Mining.MintEndpoint = v
	}
	if v := os.Getenv("CLAWMINER_ARC_URL"); v != "" {
		c.Mining.ArcURL = v
	}
	if v := os.Getenv("CLAWMINER_ARC_API_KEY"); v != "" {
		c.Mining.ArcAPIKey = v
	}
}

// DBPath returns the full path to the SQLite database file.
func (c *Config) DBPath() string {
	return filepath.Join(c.DataDir, "clawminer.db")
}
