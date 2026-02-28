package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/content"
	"github.com/b0ase/path402/apps/clawminer/internal/relay"
)

// DaemonInfo provides read-only access to daemon state for the API.
type DaemonInfo interface {
	NodeID() string
	Uptime() time.Duration
	PeerCount() int
	GossipPeerID() string
	MiningStatus() map[string]interface{}
	WalletStatus() map[string]interface{}
	HeaderSyncStatus() map[string]interface{}
	ValidateMerkleRoot(root string, height int) (bool, error)
	PauseMining()
	ResumeMining()
	IsMiningPaused() bool
}

// corsMiddleware allows cross-origin requests from admin dashboards.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ContentAnnouncer broadcasts a CONTENT_OFFER to the gossip network.
type ContentAnnouncer func(tokenID, contentHash string, contentSize int, contentType string, priceSats int, serverAddress string)

// Server is the HTTP JSON API for the ClawMiner daemon.
type Server struct {
	httpSrv           *http.Server
	daemon            DaemonInfo
	relaySvc          *relay.Service
	contentStore      *content.Store
	contentAnnouncer  ContentAnnouncer
	bind              string
	port              int
}

// New creates an HTTP server. relaySvc may be nil if relay is not enabled.
func New(bind string, port int, daemon DaemonInfo, relaySvc ...*relay.Service) *Server {
	s := &Server{daemon: daemon, bind: bind, port: port}
	if len(relaySvc) > 0 && relaySvc[0] != nil {
		s.relaySvc = relaySvc[0]
	}
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpSrv = &http.Server{
		Handler: corsMiddleware(mux),
	}
	return s
}

// SetRelayService attaches the relay service and mounts its HTTP routes.
func (s *Server) SetRelayService(svc *relay.Service) {
	s.relaySvc = svc
}

// SetContentStore attaches the content store for content API routes.
func (s *Server) SetContentStore(store *content.Store) {
	s.contentStore = store
}

// SetContentAnnouncer sets the callback for broadcasting content offers.
func (s *Server) SetContentAnnouncer(fn ContentAnnouncer) {
	s.contentAnnouncer = fn
}

// Start pre-acquires the port and begins serving HTTP requests.
// If the primary port is in use, it falls back to port+1.
// Returns the actual port bound.
func (s *Server) Start() (int, error) {
	addr := fmt.Sprintf("%s:%d", s.bind, s.port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Try fallback port
		fallbackPort := s.port + 1
		fallbackAddr := fmt.Sprintf("%s:%d", s.bind, fallbackPort)
		ln, err = net.Listen("tcp", fallbackAddr)
		if err != nil {
			return 0, fmt.Errorf("listen on %s and fallback %s: %w", addr, fallbackAddr, err)
		}
		log.Printf("[api] WARNING: Using fallback port %d (primary %d was in use)", fallbackPort, s.port)
		s.port = fallbackPort
	}

	log.Printf("[api] HTTP API listening on %s:%d", s.bind, s.port)
	go func() {
		if err := s.httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[api] HTTP server error: %v", err)
		}
	}()
	return s.port, nil
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.httpSrv.Shutdown(ctx)
	log.Println("[api] HTTP server stopped")
}
