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
	EnableDHT      bool     `yaml:"enable_dht"`
}

type APIConfig struct {
	Port int    `yaml:"port"`
	Bind string `yaml:"bind"`
}

type WalletConfig struct {
	Key     string `yaml:"key"`
	Address string `yaml:"address"` // Public BSV address for mining rewards (no private key needed)
}

type MiningConfig struct {
	Enabled           bool          `yaml:"enabled"`
	Difficulty        int           `yaml:"difficulty"`
	HeartbeatInterval time.Duration `yaml:"heartbeat_interval"`
	MinItems          int           `yaml:"min_items"`
	BatchSize         int           `yaml:"batch_size"`
	TokenID           string        `yaml:"token_id"`
	MintEndpoint      string        `yaml:"mint_endpoint"`   // HTTP mint service URL (fallback)
	ArcURL            string        `yaml:"arc_url"`          // ARC broadcaster URL
	ArcAPIKey         string        `yaml:"arc_api_key"`      // ARC API key (optional)
	BroadcastMode     string        `yaml:"broadcast_mode"`   // "native", "http", or "none"
	TargetBlockTime   time.Duration `yaml:"target_block_time"`  // Target time between network blocks (Bitcoin: 10m)
	AdjustmentPeriod  int           `yaml:"adjustment_period"`  // Blocks between difficulty adjustments
}

type HeadersConfig struct {
	BHSURL       string        `yaml:"bhs_url"`
	BHSAPIKey    string        `yaml:"bhs_api_key"`
	SyncOnBoot   bool          `yaml:"sync_on_boot"`
	PollInterval time.Duration `yaml:"poll_interval"`
	BatchSize    int           `yaml:"batch_size"`
}

type LogConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

type Config struct {
	DataDir string        `yaml:"data_dir"`
	Gossip  GossipConfig  `yaml:"gossip"`
	API     APIConfig     `yaml:"api"`
	Wallet  WalletConfig  `yaml:"wallet"`
	Mining  MiningConfig  `yaml:"mining"`
	Headers HeadersConfig `yaml:"headers"`
	Log     LogConfig     `yaml:"log"`
}

func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		DataDir: filepath.Join(home, ".clawminer"),
		Gossip: GossipConfig{
			Port: 4020,
			BootstrapPeers: []string{
				"/ip4/135.181.103.181/tcp/4020/p2p/12D3KooWQ4jTKQZaQFksTBuBNSZ6jTGDvWurLYvKzsQv1K7uxcLi",
			},
			MaxPeers:  50,
			EnableDHT: true,
		},
		API: APIConfig{
			Port: 8402,
			Bind: "127.0.0.1",
		},
		Wallet: WalletConfig{},
		Mining: MiningConfig{
			Enabled:           true,
			Difficulty:        3,
			HeartbeatInterval: 15 * time.Second,
			MinItems:          5,
			BatchSize:         10,
			TokenID:           "32ae25f861192f286bdbaf28f50b8ac1cd5ec4ff0b23a9831fa821acf91e5d02_0",
			BroadcastMode:     "native",
			ArcURL:            "https://arc.taal.com",
			TargetBlockTime:   10 * time.Minute, // Same as Bitcoin — forces global competition
			AdjustmentPeriod:  144,              // ~1 day at 10min blocks
		},
		Headers: HeadersConfig{
			BHSURL:       "http://135.181.103.181:8090",
			BHSAPIKey:    "clawminer-bhs-2026",
			SyncOnBoot:   true,
			PollInterval: 30 * time.Second,
			BatchSize:    2000,
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
	if v := os.Getenv("CLAWMINER_WALLET_ADDRESS"); v != "" {
		c.Wallet.Address = v
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
	if v := os.Getenv("CLAWMINER_BHS_URL"); v != "" {
		c.Headers.BHSURL = v
	}
	if v := os.Getenv("CLAWMINER_BHS_API_KEY"); v != "" {
		c.Headers.BHSAPIKey = v
	}
}

// LoadFromBytes parses YAML config from bytes and merges with defaults.
// Used by the mobile package where there's no config file on disk.
func LoadFromBytes(data []byte) (*Config, error) {
	cfg := DefaultConfig()
	if len(data) > 0 {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, err
		}
	}
	cfg.applyEnv()
	return cfg, nil
}

// DBPath returns the full path to the SQLite database file.
func (c *Config) DBPath() string {
	return filepath.Join(c.DataDir, "clawminer.db")
}
