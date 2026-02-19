package server

import (
	"context"
	"fmt"
	"log"
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
}

// New creates an HTTP server.
func New(bind string, port int, daemon DaemonInfo) *Server {
	s := &Server{daemon: daemon}
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpSrv = &http.Server{
		Addr:    fmt.Sprintf("%s:%d", bind, port),
		Handler: mux,
	}
	return s
}

// Start begins serving HTTP requests.
func (s *Server) Start() error {
	log.Printf("[api] HTTP API listening on %s", s.httpSrv.Addr)
	return s.httpSrv.ListenAndServe()
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.httpSrv.Shutdown(ctx)
	log.Println("[api] HTTP server stopped")
}
