package main

import (
	"bufio"
	"context"
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
	"github.com/b0ase/path402/apps/clawminer/internal/mcpserver"
)

var Version = "0.3.0"

func main() {
	cfgPath := flag.String("config", "", "path to clawminer.yaml")
	addressFlag := flag.String("address", "", "BSV address for mining rewards")
	mcpFlag := flag.Bool("mcp", false, "run as MCP tool server on stdio (JSON-RPC)")
	flag.Parse()

	if *mcpFlag {
		runMCP(*cfgPath, *addressFlag)
		return
	}

	runDaemon(*cfgPath, *addressFlag)
}

// runMCP starts the daemon in the background and serves MCP on stdio.
// All logging goes to stderr — stdout is reserved for MCP JSON-RPC.
func runMCP(cfgPath, addressFlag string) {
	// Redirect all logging to stderr (stdout = MCP JSON-RPC only)
	log.SetOutput(os.Stderr)

	if cfgPath == "" {
		home, _ := os.UserHomeDir()
		cfgPath = filepath.Join(home, ".clawminer", "clawminer.yaml")
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("[mcp] Failed to load config: %v", err)
	}

	if addressFlag != "" {
		cfg.Wallet.Address = addressFlag
	}

	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		log.Fatalf("[mcp] Failed to create data dir %s: %v", cfg.DataDir, err)
	}

	d, err := daemon.New(cfg)
	if err != nil {
		log.Fatalf("[mcp] Failed to create daemon: %v", err)
	}

	if err := d.Start(); err != nil {
		log.Fatalf("[mcp] Failed to start daemon: %v", err)
	}

	log.Println("[mcp] Daemon started in background, launching MCP server on stdio")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle signals for clean shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("[mcp] Received %s, shutting down...", sig)
		cancel()
	}()

	srv := mcpserver.New(Version, d)
	if err := srv.Run(ctx); err != nil {
		log.Printf("[mcp] MCP server stopped: %v", err)
	}

	d.Stop()
	log.Println("[mcp] Goodbye.")
}

// runDaemon is the original daemon mode with interactive banner + signal handling.
func runDaemon(cfgPath, addressFlag string) {
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
	if cfgPath == "" {
		home, _ := os.UserHomeDir()
		cfgPath = filepath.Join(home, ".clawminer", "clawminer.yaml")
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("[main] Failed to load config: %v", err)
	}

	// --address flag overrides config
	if addressFlag != "" {
		cfg.Wallet.Address = addressFlag
	}

	// Wallet address prompt — always show unless user provided --address or env/config override
	defaultAddr := "1HNcvDZNosbxWeB9grD769u3bAKYNKRHTs"
	userProvidedAddress := addressFlag != "" || os.Getenv("CLAWMINER_WALLET_ADDRESS") != ""

	if !userProvidedAddress && cfg.Wallet.Key == "" {
		fmt.Println()
		if cfg.Wallet.Address == defaultAddr {
			fmt.Println(clr + "  Mining rewards address" + rst)
			fmt.Println("  Rewards currently go to the path402 project address:")
			fmt.Println("  " + dim + defaultAddr + rst)
			fmt.Println()
			fmt.Println("  Enter YOUR BSV address to receive rewards yourself,")
			fmt.Println("  or press Enter to donate rewards to the path402 project.")
			fmt.Println(dim + "  Must be P2PKH (starts with '1') from an Ordinals-compatible wallet (e.g. yours.org)." + rst)
		} else {
			fmt.Println(clr + "  Mining rewards address" + rst)
			fmt.Printf("  Currently set to: %s\n", cfg.Wallet.Address)
			fmt.Println("  Enter a new BSV address, or press Enter to keep it.")
			fmt.Println(dim + "  Must be P2PKH (starts with '1') from an Ordinals-compatible wallet (e.g. yours.org)." + rst)
		}
		fmt.Println()
		fmt.Print("  Address: ")
		reader := bufio.NewReader(os.Stdin)
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		if input != "" {
			cfg.Wallet.Address = input
			fmt.Printf("\n"+dim+"  Mining rewards → %s\n"+rst, input)
			fmt.Println(dim + "  Tip: set wallet.address in " + cfgPath + " to skip this prompt." + rst)
		} else if cfg.Wallet.Address == defaultAddr {
			fmt.Println(dim + "  Donating rewards to path402 project. Thank you!" + rst)
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
