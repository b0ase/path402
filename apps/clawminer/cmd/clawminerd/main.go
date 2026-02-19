package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/daemon"
)

var Version = "0.1.0"

func main() {
	cfgPath := flag.String("config", "", "path to clawminer.yaml")
	flag.Parse()

	// ANSI orange: \033[38;5;208m  Reset: \033[0m
	orange := "\033[38;5;208m"
	reset := "\033[0m"
	dim := "\033[2m"

	fmt.Printf(orange+`
        ,/}           ,/}
       // }}         // }}
      //  }}   _ _  //  }}
     //  ,}} _| | |//  ,}}
    //__/ }}/    |_//__/ }}
    '---'{//  ___   '---'{/
         | | / __| | __ ___      __
         | || |    | |/ _`+"`"+` \ \ /\ / /
         | || |__  | | (_| |\ V  V /
         |_| \___| |_|\__,_| \_/\_/
              __  __ _
             |  \/  (_)_ __   ___ _ __
             | |\/| | | '_ \ / _ \ '__|
             | |  | | | | | |  __/ |
             |_|  |_|_|_| |_|\___|_|
`+reset+`
  `+dim+`$402 Proof-of-Indexing Miner  v%s`+reset+`
  `+orange+`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`+reset+`
`, Version)

	// Resolve config path
	if *cfgPath == "" {
		home, _ := os.UserHomeDir()
		*cfgPath = filepath.Join(home, ".clawminer", "clawminer.yaml")
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("[main] Failed to load config: %v", err)
	}

	// Ensure data directory exists
	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		log.Fatalf("[main] Failed to create data dir %s: %v", cfg.DataDir, err)
	}

	log.Printf("[main] Data dir: %s", cfg.DataDir)

	d, err := daemon.New(cfg)
	if err != nil {
		log.Fatalf("[main] Failed to create daemon: %v", err)
	}

	if err := d.Start(); err != nil {
		log.Fatalf("[main] Failed to start daemon: %v", err)
	}

	// Block on signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("[main] Received %s, shutting down...", sig)

	d.Stop()
	log.Println("[main] Goodbye.")
}
