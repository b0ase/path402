package mcpserver

import (
	"context"
	"fmt"
	"strings"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// --- Input types ---

type emptyInput struct{}

type tokensInput struct {
	Limit int `json:"limit" jsonschema:"max number of tokens to return (0 = all)"`
}

type verifyMerkleInput struct {
	Root   string `json:"root" jsonschema:"merkle root hash to verify"`
	Height int    `json:"height" jsonschema:"block height to check against"`
}

type walletImportInput struct {
	WIF string `json:"wif" jsonschema:"WIF-encoded private key to import"`
}

// registerTools adds all clawminer MCP tools to the server.
func (s *MCPServer) registerTools() {
	// Phase 1: Read-only tools

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_status",
		Description: "Full node status — ID, uptime, peers, mining, wallet, headers",
	}, s.handleStatus)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_mining",
		Description: "Mining stats — blocks mined, hash rate, mempool, difficulty, miner address",
	}, s.handleMining)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_wallet",
		Description: "Wallet info — address and public key",
	}, s.handleWallet)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_peers",
		Description: "Connected peers with reputation scores",
	}, s.handlePeers)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_tokens",
		Description: "Known $402 tokens discovered via gossip",
	}, s.handleTokens)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_portfolio",
		Description: "Token holdings with PnL summary",
	}, s.handlePortfolio)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_headers",
		Description: "BSV header chain sync status",
	}, s.handleHeaders)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_verify_merkle",
		Description: "Validate a merkle root against the synced header chain",
	}, s.handleVerifyMerkle)

	// Phase 2: Write tools

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_wallet_import",
		Description: "Import a wallet from WIF — hot-swaps without restart, persists to DB",
	}, s.handleWalletImport)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_wallet_generate",
		Description: "Generate a new wallet keypair — persists to DB and hot-swaps",
	}, s.handleWalletGenerate)

	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "clawminer_wallet_export",
		Description: "Export the current wallet's WIF private key",
	}, s.handleWalletExport)
}

// --- Handlers ---

func (s *MCPServer) handleStatus(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	mining := s.daemon.MiningStatus()
	wallet := s.daemon.WalletStatus()
	headers := s.daemon.HeaderSyncStatus()

	peers, _ := db.GetActivePeers()
	tokens, _ := db.GetAllTokens()
	summary, _ := db.GetPortfolioSummary()

	peerCount := 0
	if peers != nil {
		peerCount = len(peers)
	}
	tokenCount := 0
	if tokens != nil {
		tokenCount = len(tokens)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# ClawMiner Status\n\n")
	fmt.Fprintf(&b, "**Node ID:** `%s`\n", s.daemon.NodeID())
	fmt.Fprintf(&b, "**Uptime:** %s\n", s.daemon.Uptime().Round(1e9))
	fmt.Fprintf(&b, "**Gossip Peer ID:** `%s`\n\n", s.daemon.GossipPeerID())

	fmt.Fprintf(&b, "## Network\n")
	fmt.Fprintf(&b, "- Connected peers: %d\n", s.daemon.PeerCount())
	fmt.Fprintf(&b, "- Known peers: %d\n", peerCount)
	fmt.Fprintf(&b, "- Known tokens: %d\n\n", tokenCount)

	fmt.Fprintf(&b, "## Mining\n")
	for k, v := range mining {
		fmt.Fprintf(&b, "- %s: %v\n", k, v)
	}

	fmt.Fprintf(&b, "\n## Wallet\n")
	for k, v := range wallet {
		fmt.Fprintf(&b, "- %s: %v\n", k, v)
	}

	fmt.Fprintf(&b, "\n## Headers\n")
	for k, v := range headers {
		fmt.Fprintf(&b, "- %s: %v\n", k, v)
	}

	if summary != nil {
		fmt.Fprintf(&b, "\n## Portfolio\n")
		fmt.Fprintf(&b, "- Total spent: %d SAT\n", summary.TotalSpent)
		fmt.Fprintf(&b, "- Total revenue: %d SAT\n", summary.TotalRevenue)
		fmt.Fprintf(&b, "- PnL: %d SAT\n", summary.TotalPnL)
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handleMining(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	mining := s.daemon.MiningStatus()

	var b strings.Builder
	fmt.Fprintf(&b, "# Mining Status\n\n")
	for k, v := range mining {
		fmt.Fprintf(&b, "- **%s:** %v\n", k, v)
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handleWallet(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	wallet := s.daemon.WalletStatus()

	var b strings.Builder
	fmt.Fprintf(&b, "# Wallet\n\n")
	if len(wallet) == 0 {
		fmt.Fprintf(&b, "No wallet loaded.\n")
	} else {
		for k, v := range wallet {
			fmt.Fprintf(&b, "- **%s:** `%v`\n", k, v)
		}
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handlePeers(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	peers, err := db.GetActivePeers()
	if err != nil {
		return errResult(fmt.Sprintf("failed to get peers: %v", err)), nil, nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# Peers (%d)\n\n", len(peers))

	if len(peers) == 0 {
		fmt.Fprintf(&b, "No active peers.\n")
	} else {
		fmt.Fprintf(&b, "| Peer ID | Host | Port | Reputation | Valid | Invalid |\n")
		fmt.Fprintf(&b, "|---------|------|------|------------|-------|--------|\n")
		for _, p := range peers {
			peerID := p.PeerID
			if len(peerID) > 16 {
				peerID = peerID[:16] + "..."
			}
			fmt.Fprintf(&b, "| `%s` | %s | %d | %d | %d | %d |\n",
				peerID, p.Host, p.Port, p.ReputationScore, p.ValidMessages, p.InvalidMessages)
		}
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handleTokens(_ context.Context, _ *mcp.CallToolRequest, input tokensInput) (*mcp.CallToolResult, any, error) {
	tokens, err := db.GetAllTokens()
	if err != nil {
		return errResult(fmt.Sprintf("failed to get tokens: %v", err)), nil, nil
	}

	if input.Limit > 0 && len(tokens) > input.Limit {
		tokens = tokens[:input.Limit]
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# Tokens (%d)\n\n", len(tokens))

	if len(tokens) == 0 {
		fmt.Fprintf(&b, "No tokens discovered yet.\n")
	} else {
		fmt.Fprintf(&b, "| Token ID | Name | Price (SAT) | Supply | Status |\n")
		fmt.Fprintf(&b, "|----------|------|-------------|--------|--------|\n")
		for _, t := range tokens {
			name := "-"
			if t.Name != nil {
				name = *t.Name
			}
			tokenID := t.TokenID
			if len(tokenID) > 16 {
				tokenID = tokenID[:16] + "..."
			}
			fmt.Fprintf(&b, "| `%s` | %s | %d | %d | %s |\n",
				tokenID, name, t.BasePriceSats, t.CurrentSupply, t.VerificationStatus)
		}
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handlePortfolio(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	holdings, err := db.GetPortfolio()
	if err != nil {
		return errResult(fmt.Sprintf("failed to get portfolio: %v", err)), nil, nil
	}
	summary, _ := db.GetPortfolioSummary()

	var b strings.Builder
	fmt.Fprintf(&b, "# Portfolio\n\n")

	if summary != nil {
		fmt.Fprintf(&b, "## Summary\n")
		fmt.Fprintf(&b, "- Total spent: **%d SAT**\n", summary.TotalSpent)
		fmt.Fprintf(&b, "- Total revenue: **%d SAT**\n", summary.TotalRevenue)
		fmt.Fprintf(&b, "- PnL: **%d SAT**\n\n", summary.TotalPnL)
	}

	if len(holdings) == 0 {
		fmt.Fprintf(&b, "No holdings.\n")
	} else {
		fmt.Fprintf(&b, "## Holdings\n\n")
		fmt.Fprintf(&b, "| Token | Balance | Spent | Revenue | Serves |\n")
		fmt.Fprintf(&b, "|-------|---------|-------|---------|--------|\n")
		for _, h := range holdings {
			name := h.TokenID
			if h.Name != nil {
				name = *h.Name
			}
			if len(name) > 20 {
				name = name[:20] + "..."
			}
			fmt.Fprintf(&b, "| %s | %d | %d SAT | %d SAT | %d |\n",
				name, h.Balance, h.TotalSpentSats, h.TotalRevenueSats, h.TotalServes)
		}
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handleHeaders(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	headers := s.daemon.HeaderSyncStatus()

	var b strings.Builder
	fmt.Fprintf(&b, "# Header Sync\n\n")
	for k, v := range headers {
		fmt.Fprintf(&b, "- **%s:** %v\n", k, v)
	}

	return textResult(b.String()), nil, nil
}

func (s *MCPServer) handleVerifyMerkle(_ context.Context, _ *mcp.CallToolRequest, input verifyMerkleInput) (*mcp.CallToolResult, any, error) {
	if input.Root == "" {
		return errResult("root is required"), nil, nil
	}

	valid, err := s.daemon.ValidateMerkleRoot(input.Root, input.Height)
	if err != nil {
		return errResult(fmt.Sprintf("verification failed: %v", err)), nil, nil
	}

	status := "INVALID"
	if valid {
		status = "VALID"
	}

	text := fmt.Sprintf("# Merkle Verification\n\n- **Root:** `%s`\n- **Height:** %d\n- **Result:** %s",
		input.Root, input.Height, status)

	return textResult(text), nil, nil
}

// --- Phase 2: Write tools ---

func (s *MCPServer) handleWalletImport(_ context.Context, _ *mcp.CallToolRequest, input walletImportInput) (*mcp.CallToolResult, any, error) {
	if input.WIF == "" {
		return errResult("wif is required"), nil, nil
	}

	if err := s.daemon.ImportWallet(input.WIF); err != nil {
		return errResult(fmt.Sprintf("import failed: %v", err)), nil, nil
	}

	wallet := s.daemon.WalletStatus()
	addr, _ := wallet["address"].(string)

	return textResult(fmt.Sprintf("Wallet imported successfully.\n\n- **Address:** `%s`", addr)), nil, nil
}

func (s *MCPServer) handleWalletGenerate(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	if err := s.daemon.GenerateNewWallet(); err != nil {
		return errResult(fmt.Sprintf("generation failed: %v", err)), nil, nil
	}

	wallet := s.daemon.WalletStatus()
	addr, _ := wallet["address"].(string)

	return textResult(fmt.Sprintf("New wallet generated.\n\n- **Address:** `%s`", addr)), nil, nil
}

func (s *MCPServer) handleWalletExport(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	wif, err := s.daemon.ExportWIF()
	if err != nil {
		return errResult(fmt.Sprintf("export failed: %v", err)), nil, nil
	}

	return textResult(fmt.Sprintf("# Wallet Export\n\n**WIF:** `%s`\n\n> Keep this secret. Anyone with this key controls the wallet.", wif)), nil, nil
}

// --- Helpers ---

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}

func errResult(msg string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: msg}},
		IsError: true,
	}
}
