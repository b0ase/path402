package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/daemon"
)

var Version = "0.1.3"

func main() {
	cfgPath := flag.String("config", "", "path to clawminer.yaml")
	addressFlag := flag.String("address", "", "BSV address for mining rewards")
	flag.Parse()

	clr := "\033[38;2;255;102;0m" // orange
	rst := "\033[0m"              // reset
	dim := "\033[2m"              // dim

	fmt.Print("\n" + clr)
	fmt.Println(`  ██████╗ ██╗       █████╗  ██╗    ██╗              _.---"""""""""---._`)
	fmt.Println(` ██╔════╝ ██║      ██╔══██╗ ██║    ██║           .-'                    '-._`)
	fmt.Println(` ██║      ██║      ███████║ ██║ █╗ ██║         .'                            '.`)
	fmt.Println(` ██║      ██║      ██╔══██║ ██║███╗██║        /                                )`)
	fmt.Println(` ╚██████╗ ███████╗ ██║  ██║ ╚███╔███╔╝        |                          _~.~-'`)
	fmt.Println(`  ╚═════╝ ╚══════╝ ╚═╝  ╚═╝  ╚══╝╚══╝         \                    _~.~'`)
	fmt.Println(` ███╗   ███╗ ██╗ ███╗   ██╗ ███████╗ ██████╗    '-._           _.---'`)
	fmt.Println(` ████╗ ████║ ██║ ████╗  ██║ ██╔════╝ ██╔══██╗       '----.___---'`)
	fmt.Println(` ██╔████╔██║ ██║ ██╔██╗ ██║ █████╗   ██████╔╝           |`)
	fmt.Println(` ██║╚██╔╝██║ ██║ ██║╚██╗██║ ██╔══╝   ██╔══██╗       _.-'~.~--.______________.-'`)
	fmt.Println(` ██║ ╚═╝ ██║ ██║ ██║ ╚████║ ███████╗ ██║  ██║      / ~.~'              _->`)
	fmt.Println(` ╚═╝     ╚═╝ ╚═╝ ╚═╝  ╚═══╝ ╚══════╝ ╚═╝  ╚═╝     '-.______________.-'`)
	fmt.Print(rst)
	fmt.Printf(dim+"  $402 Proof-of-Indexing Miner  v%s"+rst+"\n", Version)
	fmt.Println(clr + `  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` + rst)

	// Resolve config path
	if *cfgPath == "" {
		home, _ := os.UserHomeDir()
		*cfgPath = filepath.Join(home, ".clawminer", "clawminer.yaml")
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("[main] Failed to load config: %v", err)
	}

	// --address flag overrides config
	if *addressFlag != "" {
		cfg.Wallet.Address = *addressFlag
	}

	// First-run: no address and no WIF configured → prompt user
	if cfg.Wallet.Address == "" && cfg.Wallet.Key == "" {
		fmt.Println()
		fmt.Println(clr + "  No mining address configured." + rst)
		fmt.Println("  Enter your BSV address to receive $402 mining rewards.")
		fmt.Println(dim + "  This must be a P2PKH address (starts with '1') from a wallet you control." + rst)
		fmt.Println(dim + "  Use an Ordinals-compatible BSV wallet (e.g. yours.org, HandCash, RelayX)." + rst)
		fmt.Println()
		fmt.Print("  Address: ")
		reader := bufio.NewReader(os.Stdin)
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		if input != "" {
			cfg.Wallet.Address = input
			fmt.Printf(dim+"  Mining rewards → %s\n"+rst, input)
			fmt.Println(dim + "  Tip: set wallet.address in " + *cfgPath + " to skip this prompt." + rst)
		}
		fmt.Println()
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
