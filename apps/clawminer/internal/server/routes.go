package server

import (
	"encoding/json"
	"net/http"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /status", s.handleStatus)
	mux.HandleFunc("GET /api/tokens", s.handleTokens)
	mux.HandleFunc("GET /api/portfolio", s.handlePortfolio)
	mux.HandleFunc("GET /api/peers", s.handlePeers)
	mux.HandleFunc("GET /api/mining/status", s.handleMiningStatus)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"status":    "ok",
		"version":   "0.1.0",
		"node_id":   s.daemon.NodeID()[:16],
		"uptime_ms": s.daemon.Uptime().Milliseconds(),
		"peers":     s.daemon.PeerCount(),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	portfolio, _ := db.GetPortfolioSummary()
	tokens, _ := db.GetAllTokens()
	peers, _ := db.GetActivePeers()

	tokenCount := 0
	if tokens != nil {
		tokenCount = len(tokens)
	}
	peerCount := 0
	if peers != nil {
		peerCount = len(peers)
	}

	status := map[string]interface{}{
		"node_id":   s.daemon.NodeID(),
		"uptime_ms": s.daemon.Uptime().Milliseconds(),
		"peers": map[string]int{
			"connected": s.daemon.PeerCount(),
			"known":     peerCount,
		},
		"tokens": map[string]int{
			"known": tokenCount,
		},
		"mining": s.daemon.MiningStatus(),
	}

	if portfolio != nil {
		status["portfolio"] = portfolio
	}

	writeJSON(w, status)
}

func (s *Server) handleTokens(w http.ResponseWriter, r *http.Request) {
	tokens, err := db.GetAllTokens()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if tokens == nil {
		tokens = []db.Token{}
	}
	writeJSON(w, tokens)
}

func (s *Server) handlePortfolio(w http.ResponseWriter, r *http.Request) {
	holdings, err := db.GetPortfolio()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	summary, _ := db.GetPortfolioSummary()

	if holdings == nil {
		holdings = []db.Holding{}
	}

	writeJSON(w, map[string]interface{}{
		"holdings": holdings,
		"summary":  summary,
	})
}

func (s *Server) handlePeers(w http.ResponseWriter, r *http.Request) {
	peers, err := db.GetActivePeers()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if peers == nil {
		peers = []db.Peer{}
	}
	writeJSON(w, peers)
}

func (s *Server) handleMiningStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.daemon.MiningStatus())
}
