package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getlantern/systray"
)

var Version = "0.3.0"

const (
	daemonPort   = 8402
	pollInterval = 3 * time.Second
)

type trayApp struct {
	mu         sync.Mutex
	daemonCmd  *exec.Cmd
	ownsDaemon bool
	configPath string

	// === Menu items ===
	// Header
	mTitle   *systray.MenuItem
	mUptime  *systray.MenuItem

	// Mining section
	mMiningHeader *systray.MenuItem
	mStatus       *systray.MenuItem
	mHashRate     *systray.MenuItem
	mDifficulty   *systray.MenuItem
	mBlockHeight  *systray.MenuItem
	mBlocksMined  *systray.MenuItem
	mMempool      *systray.MenuItem
	mLastBlock    *systray.MenuItem

	// Network section
	mNetHeader   *systray.MenuItem
	mPeers       *systray.MenuItem
	mPeerID      *systray.MenuItem
	mNetDiff     *systray.MenuItem

	// Recent Blocks section
	mBlocksHeader *systray.MenuItem
	mBlock1       *systray.MenuItem
	mBlock2       *systray.MenuItem
	mBlock3       *systray.MenuItem

	// Wallet section
	mWalletHeader *systray.MenuItem
	mWalletAddr   *systray.MenuItem
	mCopyAddr     *systray.MenuItem

	// Actions
	mDashboard *systray.MenuItem
	mCopyPeer  *systray.MenuItem
	mQuit      *systray.MenuItem
}

type miningStatus struct {
	BlocksMined int     `json:"blocks_mined"`
	HashRate    float64 `json:"hash_rate"`
	MempoolSize int     `json:"mempool_size"`
	IsMining    bool    `json:"is_mining"`
	LastBlock   string  `json:"last_block"`
	MinerAddr   string  `json:"miner_address"`
	Difficulty  int     `json:"difficulty"`
	Network     struct {
		Target            string `json:"target"`
		Difficulty        int    `json:"difficulty"`
		BlocksInPeriod    int    `json:"blocks_in_period"`
		BlocksUntilAdjust int    `json:"blocks_until_adjust"`
		TargetBlockTimeSec int   `json:"target_block_time_s"`
		TotalBlocks       int    `json:"total_network_blocks"`
		AdjustmentPeriod  int    `json:"adjustment_period"`
	} `json:"network"`
}

type fullStatus struct {
	NodeID   string `json:"node_id"`
	UptimeMs int64  `json:"uptime_ms"`
	Peers    struct {
		Connected int    `json:"connected"`
		Known     int    `json:"known"`
		PeerID    string `json:"peer_id"`
	} `json:"peers"`
}

type blockInfo struct {
	Hash        string `json:"hash"`
	Height      int    `json:"height"`
	MinerAddr   string `json:"miner_address"`
	Timestamp   int64  `json:"timestamp"`
	IsOwn       bool   `json:"is_own"`
}

func main() {
	app := &trayApp{}

	for i, arg := range os.Args[1:] {
		if arg == "-config" && i+1 < len(os.Args)-1 {
			app.configPath = os.Args[i+2]
		}
	}

	systray.Run(app.onReady, app.onExit)
}

func (a *trayApp) onReady() {
	systray.SetIcon(iconData)
	systray.SetTooltip("ClawMiner v" + Version)

	// ── Header ──────────────────────────────────
	a.mTitle = systray.AddMenuItem("🦀 ClawMiner v"+Version, "")
	a.mTitle.Disable()
	a.mUptime = systray.AddMenuItem("     ⏱ Uptime: starting...", "")
	a.mUptime.Disable()

	systray.AddSeparator()

	// ── Mining ──────────────────────────────────
	a.mMiningHeader = systray.AddMenuItem("⛏  MINING", "")
	a.mMiningHeader.Disable()
	a.mStatus = systray.AddMenuItem("     🔶 Status: Checking...", "")
	a.mStatus.Disable()
	a.mHashRate = systray.AddMenuItem("     🔥 Hashrate: --", "")
	a.mHashRate.Disable()
	a.mDifficulty = systray.AddMenuItem("     🎯 Difficulty: --", "")
	a.mDifficulty.Disable()
	a.mBlockHeight = systray.AddMenuItem("     📦 Network Blocks: --", "")
	a.mBlockHeight.Disable()
	a.mBlocksMined = systray.AddMenuItem("     🏆 Blocks Mined: --", "")
	a.mBlocksMined.Disable()
	a.mMempool = systray.AddMenuItem("     📋 Mempool: --", "")
	a.mMempool.Disable()
	a.mLastBlock = systray.AddMenuItem("     🔗 Last Block: --", "")
	a.mLastBlock.Disable()

	systray.AddSeparator()

	// ── Network ─────────────────────────────────
	a.mNetHeader = systray.AddMenuItem("🌐 NETWORK", "")
	a.mNetHeader.Disable()
	a.mPeers = systray.AddMenuItem("     👥 Peers: --", "")
	a.mPeers.Disable()
	a.mPeerID = systray.AddMenuItem("     🆔 Peer ID: --", "")
	a.mPeerID.Disable()
	a.mNetDiff = systray.AddMenuItem("     ⏳ Target Block Time: --", "")
	a.mNetDiff.Disable()

	systray.AddSeparator()

	// ── Recent Blocks ───────────────────────────
	a.mBlocksHeader = systray.AddMenuItem("🧱 RECENT BLOCKS", "")
	a.mBlocksHeader.Disable()
	a.mBlock1 = systray.AddMenuItem("     --", "")
	a.mBlock1.Disable()
	a.mBlock2 = systray.AddMenuItem("     --", "")
	a.mBlock2.Disable()
	a.mBlock3 = systray.AddMenuItem("     --", "")
	a.mBlock3.Disable()

	systray.AddSeparator()

	// ── Wallet ──────────────────────────────────
	a.mWalletHeader = systray.AddMenuItem("💰 WALLET", "")
	a.mWalletHeader.Disable()
	a.mWalletAddr = systray.AddMenuItem("     🔑 Address: --", "")
	a.mWalletAddr.Disable()
	a.mCopyAddr = systray.AddMenuItem("     📋 Copy Address", "Copy wallet address to clipboard")

	systray.AddSeparator()

	// ── Actions ─────────────────────────────────
	a.mDashboard = systray.AddMenuItem("🖥  Open Dashboard", "Open ClawMiner dashboard in browser")
	a.mCopyPeer = systray.AddMenuItem("📋 Copy Peer ID", "Copy libp2p peer ID to clipboard")

	systray.AddSeparator()

	a.mQuit = systray.AddMenuItem("Quit ClawMiner", "Stop daemon and quit")

	// Start daemon if not already running
	if !a.isDaemonRunning() {
		a.startDaemon()
	}

	go a.pollLoop()
	go a.handleClicks()
}

func (a *trayApp) onExit() {
	a.stopDaemon()
}

func (a *trayApp) isDaemonRunning() bool {
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/health", daemonPort))
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (a *trayApp) startDaemon() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.daemonCmd != nil {
		return
	}

	binaryPath := "clawminerd"
	if exe, err := os.Executable(); err == nil {
		dir := exe[:strings.LastIndex(exe, "/")+1]
		candidate := dir + "clawminerd"
		if _, err := os.Stat(candidate); err == nil {
			binaryPath = candidate
		}
	}

	args := []string{}
	if a.configPath != "" {
		args = append(args, "-config", a.configPath)
	}

	a.daemonCmd = exec.Command(binaryPath, args...)
	a.daemonCmd.Stdout = os.Stdout
	a.daemonCmd.Stderr = os.Stderr
	a.daemonCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if err := a.daemonCmd.Start(); err != nil {
		log.Printf("[tray] Failed to start daemon: %v", err)
		a.daemonCmd = nil
		return
	}

	a.ownsDaemon = true
	log.Printf("[tray] Started daemon (PID %d)", a.daemonCmd.Process.Pid)

	go func() {
		if err := a.daemonCmd.Wait(); err != nil {
			log.Printf("[tray] Daemon exited: %v", err)
		}
		a.mu.Lock()
		a.daemonCmd = nil
		a.ownsDaemon = false
		a.mu.Unlock()
	}()

	for i := 0; i < 30; i++ {
		time.Sleep(500 * time.Millisecond)
		if a.isDaemonRunning() {
			log.Println("[tray] Daemon is ready")
			return
		}
	}
	log.Println("[tray] WARNING: Daemon did not become ready within 15s")
}

func (a *trayApp) stopDaemon() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.daemonCmd == nil || !a.ownsDaemon {
		return
	}

	log.Println("[tray] Stopping daemon...")
	a.daemonCmd.Process.Signal(syscall.SIGTERM)

	done := make(chan struct{})
	go func() {
		a.daemonCmd.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Println("[tray] Daemon stopped cleanly")
	case <-time.After(5 * time.Second):
		log.Println("[tray] Daemon did not stop, sending SIGKILL")
		a.daemonCmd.Process.Kill()
	}
	a.daemonCmd = nil
}

func (a *trayApp) pollLoop() {
	a.updateStatus()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			a.updateStatus()
		case <-sigCh:
			systray.Quit()
			return
		}
	}
}

func (a *trayApp) updateStatus() {
	mining := a.fetchMiningStatus()
	if mining == nil {
		a.mStatus.SetTitle("     🔶 Status: Daemon Offline")
		a.mHashRate.SetTitle("     🔥 Hashrate: --")
		a.mDifficulty.SetTitle("     🎯 Difficulty: --")
		a.mBlockHeight.SetTitle("     📦 Network Blocks: --")
		a.mBlocksMined.SetTitle("     🏆 Blocks Mined: --")
		a.mMempool.SetTitle("     📋 Mempool: --")
		a.mLastBlock.SetTitle("     🔗 Last Block: --")
		a.mPeers.SetTitle("     👥 Peers: --")
		a.mPeerID.SetTitle("     🆔 Peer ID: --")
		a.mNetDiff.SetTitle("     ⏳ Target Block Time: --")
		a.mWalletAddr.SetTitle("     🔑 Address: --")
		a.mUptime.SetTitle("     ⏱ Uptime: offline")
		systray.SetTooltip("ClawMiner - Offline")
		return
	}

	// Mining status
	if mining.IsMining {
		a.mStatus.SetTitle("     🟠 Mining Active")
	} else {
		a.mStatus.SetTitle("     ⏸ Idle")
	}

	// Hashrate
	hr := formatHashRate(mining.HashRate)
	a.mHashRate.SetTitle(fmt.Sprintf("     🔥 %s", hr))

	// Difficulty
	a.mDifficulty.SetTitle(fmt.Sprintf("     🎯 Difficulty: %d", mining.Difficulty))

	// Network blocks
	a.mBlockHeight.SetTitle(fmt.Sprintf("     📦 Network Blocks: %d", mining.Network.TotalBlocks))

	// Blocks mined (own)
	a.mBlocksMined.SetTitle(fmt.Sprintf("     🏆 Mined: %d", mining.BlocksMined))

	// Mempool
	a.mMempool.SetTitle(fmt.Sprintf("     📋 Mempool: %d items", mining.MempoolSize))

	// Last block hash
	lb := mining.LastBlock
	if len(lb) > 16 {
		lb = lb[:16] + "…"
	}
	a.mLastBlock.SetTitle(fmt.Sprintf("     🔗 %s", lb))

	// Wallet
	addr := mining.MinerAddr
	if len(addr) > 16 {
		a.mWalletAddr.SetTitle(fmt.Sprintf("     🔑 %s…%s", addr[:8], addr[len(addr)-6:]))
	} else if addr != "" {
		a.mWalletAddr.SetTitle(fmt.Sprintf("     🔑 %s", addr))
	}

	// Network stats
	if mining.Network.BlocksInPeriod > 0 {
		a.mNetDiff.SetTitle(fmt.Sprintf("     ⏳ Period: %d/%d blocks",
			mining.Network.BlocksInPeriod, mining.Network.AdjustmentPeriod))
	} else {
		a.mNetDiff.SetTitle(fmt.Sprintf("     ⏳ Target: %dm blocks", mining.Network.TargetBlockTimeSec/60))
	}

	// Full status (uptime, peers, peer ID)
	status := a.fetchFullStatus()
	if status != nil {
		a.mPeers.SetTitle(fmt.Sprintf("     👥 %d connected / %d known", status.Peers.Connected, status.Peers.Known))

		pid := status.Peers.PeerID
		if len(pid) > 20 {
			a.mPeerID.SetTitle(fmt.Sprintf("     🆔 %s…%s", pid[:8], pid[len(pid)-6:]))
		}

		a.mUptime.SetTitle(fmt.Sprintf("     ⏱ %s", formatUptime(status.UptimeMs)))
	}

	// Recent blocks
	a.updateRecentBlocks()

	// Tooltip
	peerCount := 0
	if status != nil {
		peerCount = status.Peers.Connected
	}
	systray.SetTooltip(fmt.Sprintf("ClawMiner - %d mined | %s | %d peers",
		mining.BlocksMined, hr, peerCount))
}

func (a *trayApp) updateRecentBlocks() {
	blocks := a.fetchRecentBlocks()
	items := []*systray.MenuItem{a.mBlock1, a.mBlock2, a.mBlock3}

	for i, item := range items {
		if i < len(blocks) {
			b := blocks[i]
			tag := "peer"
			if b.IsOwn {
				tag = "own"
			}
			hash := b.Hash
			if len(hash) > 12 {
				hash = hash[:12]
			}
			ago := formatTimeAgo(b.Timestamp)
			marker := "🟧"
			if tag == "peer" {
				marker = "⬜"
			}
			item.SetTitle(fmt.Sprintf("     %s #%d  %s…  %s", marker, b.Height, hash, ago))
		} else {
			item.SetTitle("     --")
		}
	}
}

func (a *trayApp) fetchMiningStatus() *miningStatus {
	data, err := fetchJSON(fmt.Sprintf("http://127.0.0.1:%d/api/mining/status", daemonPort))
	if err != nil {
		return nil
	}
	var ms miningStatus
	if err := json.Unmarshal(data, &ms); err != nil {
		return nil
	}
	return &ms
}

func (a *trayApp) fetchFullStatus() *fullStatus {
	data, err := fetchJSON(fmt.Sprintf("http://127.0.0.1:%d/status", daemonPort))
	if err != nil {
		return nil
	}
	var fs fullStatus
	if err := json.Unmarshal(data, &fs); err != nil {
		return nil
	}
	return &fs
}

func (a *trayApp) fetchRecentBlocks() []blockInfo {
	data, err := fetchJSON(fmt.Sprintf("http://127.0.0.1:%d/api/blocks?limit=3", daemonPort))
	if err != nil {
		return nil
	}
	var blocks []blockInfo
	if err := json.Unmarshal(data, &blocks); err != nil {
		return nil
	}
	return blocks
}

func fetchJSON(url string) ([]byte, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func formatHashRate(rate float64) string {
	switch {
	case rate >= 1e9:
		return fmt.Sprintf("%.2f GH/s", rate/1e9)
	case rate >= 1e6:
		return fmt.Sprintf("%.1f MH/s", rate/1e6)
	case rate >= 1e3:
		return fmt.Sprintf("%.1f KH/s", rate/1e3)
	default:
		return fmt.Sprintf("%.0f H/s", rate)
	}
}

func formatUptime(ms int64) string {
	d := time.Duration(ms) * time.Millisecond
	hours := int(d.Hours())
	mins := int(d.Minutes()) % 60

	if hours >= 24 {
		days := hours / 24
		hours = hours % 24
		return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, mins)
	}
	return fmt.Sprintf("%dm", mins)
}

func formatTimeAgo(ts int64) string {
	ago := time.Since(time.UnixMilli(ts))
	switch {
	case ago < time.Minute:
		return "just now"
	case ago < time.Hour:
		return fmt.Sprintf("%dm ago", int(ago.Minutes()))
	case ago < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(ago.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(ago.Hours()/24))
	}
}

func (a *trayApp) handleClicks() {
	for {
		select {
		case <-a.mDashboard.ClickedCh:
			openBrowser(fmt.Sprintf("http://127.0.0.1:%d", daemonPort))

		case <-a.mCopyAddr.ClickedCh:
			ms := a.fetchMiningStatus()
			if ms != nil && ms.MinerAddr != "" {
				copyToClipboard(ms.MinerAddr)
			}

		case <-a.mCopyPeer.ClickedCh:
			fs := a.fetchFullStatus()
			if fs != nil && fs.Peers.PeerID != "" {
				copyToClipboard(fs.Peers.PeerID)
			}

		case <-a.mQuit.ClickedCh:
			systray.Quit()
			return
		}
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		cmd = exec.Command("open", url)
	}
	cmd.Start()
}

func copyToClipboard(text string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "linux":
		cmd = exec.Command("xclip", "-selection", "clipboard")
	default:
		return
	}
	cmd.Stdin = strings.NewReader(text)
	cmd.Run()
}
