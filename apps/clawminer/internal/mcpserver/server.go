package mcpserver

import (
	"context"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// DaemonInfo provides read-only access to daemon state for MCP tools.
type DaemonInfo interface {
	NodeID() string
	Uptime() time.Duration
	PeerCount() int
	GossipPeerID() string
	MiningStatus() map[string]interface{}
	HeaderSyncStatus() map[string]interface{}
	WalletStatus() map[string]interface{}
	ValidateMerkleRoot(root string, height int) (bool, error)
	ImportWallet(wif string) error
	ExportWIF() (string, error)
	GenerateNewWallet() error
}

// MCPServer wraps the MCP protocol server with clawminer tools.
type MCPServer struct {
	server *mcp.Server
	daemon DaemonInfo
}

// New creates an MCP server with all clawminer tools registered.
func New(version string, daemon DaemonInfo) *MCPServer {
	s := &MCPServer{
		daemon: daemon,
		server: mcp.NewServer(
			&mcp.Implementation{
				Name:    "clawminer",
				Version: version,
			},
			&mcp.ServerOptions{
				Instructions: "ClawMiner $402 Proof-of-Indexing node. Provides tools to query mining status, wallet, peers, tokens, portfolio, and header sync state.",
			},
		),
	}
	s.registerTools()
	return s
}

// Run starts the MCP server on stdio, blocking until the client disconnects.
func (s *MCPServer) Run(ctx context.Context) error {
	return s.server.Run(ctx, &mcp.StdioTransport{})
}
