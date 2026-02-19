package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"
)

// DaemonInfo provides read-only access to daemon state for the API.
type DaemonInfo interface {
	NodeID() string
	Uptime() time.Duration
	PeerCount() int
	MiningStatus() map[string]interface{}
}

// Server is the HTTP JSON API for the ClawMiner daemon.
type Server struct {
	httpSrv *http.Server
	daemon  DaemonInfo
	bind    string
	port    int
}

// New creates an HTTP server.
func New(bind string, port int, daemon DaemonInfo) *Server {
	s := &Server{daemon: daemon, bind: bind, port: port}
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpSrv = &http.Server{
		Handler: mux,
	}
	return s
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
