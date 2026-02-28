package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// handleContentCreate stores new content via multipart form or raw body.
// POST /api/content
//
//	Form fields: token_id (required), content_type (optional), price_sats (optional)
//	Body/file: raw content bytes
func (s *Server) handleContentCreate(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}

	tokenID := r.URL.Query().Get("token_id")
	if tokenID == "" {
		tokenID = r.FormValue("token_id")
	}
	if tokenID == "" {
		writeError(w, 400, "token_id required")
		return
	}

	contentType := r.URL.Query().Get("content_type")
	if contentType == "" {
		contentType = r.Header.Get("Content-Type")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	priceSats := 0
	if ps := r.URL.Query().Get("price_sats"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil {
			priceSats = v
		}
	}

	// Read body (limit 100MB)
	data, err := io.ReadAll(io.LimitReader(r.Body, 100*1024*1024))
	if err != nil {
		writeError(w, 400, "failed to read body: "+err.Error())
		return
	}
	if len(data) == 0 {
		writeError(w, 400, "empty body")
		return
	}

	hash, err := s.contentStore.Put(tokenID, data, contentType, priceSats)
	if err != nil {
		writeError(w, 500, "store failed: "+err.Error())
		return
	}

	writeJSON(w, map[string]interface{}{
		"content_hash": hash,
		"content_size": len(data),
		"content_type": contentType,
		"token_id":     tokenID,
	})
}

// handleContentList returns all stored content metadata.
// GET /api/content
func (s *Server) handleContentList(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}

	items, err := s.contentStore.List()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if items == nil {
		items = []db.ContentItem{}
	}
	writeJSON(w, items)
}

// handleContentGet streams content bytes by hash.
// GET /api/content/{hash}
func (s *Server) handleContentGet(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}

	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, 400, "hash required")
		return
	}

	reader, size, err := s.contentStore.GetStream(hash)
	if err != nil {
		writeError(w, 404, "content not found")
		return
	}
	defer reader.Close()

	// Look up content type from DB
	item, _ := db.GetContentByHash(hash)
	if item != nil && item.ContentType != "" {
		w.Header().Set("Content-Type", item.ContentType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("X-Content-Hash", hash)
	io.Copy(w, reader)
}

// handleContentDelete removes content by hash.
// DELETE /api/content/{hash}
func (s *Server) handleContentDelete(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}

	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, 400, "hash required")
		return
	}

	if err := s.contentStore.Delete(hash); err != nil {
		writeError(w, 404, "content not found")
		return
	}

	writeJSON(w, map[string]string{"deleted": hash})
}

// handleContentStats returns content store statistics.
// GET /api/content/stats
func (s *Server) handleContentStats(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}
	writeJSON(w, s.contentStore.Stats())
}

// handleContentServes returns recent serve log entries.
// GET /api/content/serves?limit=50
func (s *Server) handleContentServes(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}

	entries, err := db.GetRecentServes(limit)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if entries == nil {
		entries = []db.ServeEntry{}
	}
	writeJSON(w, entries)
}

// handleContentAnnounce broadcasts a CONTENT_OFFER for stored content.
// POST /api/content/{hash}/announce
//
//	Body JSON: { "price_sats": 100, "server_address": "1xxx..." }
func (s *Server) handleContentAnnounce(w http.ResponseWriter, r *http.Request) {
	if s.contentStore == nil {
		writeError(w, 503, "content store not initialized")
		return
	}
	if s.contentAnnouncer == nil {
		writeError(w, 503, "content announcer not configured")
		return
	}

	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, 400, "hash required")
		return
	}

	if !s.contentStore.Has(hash) {
		writeError(w, 404, "content not found")
		return
	}

	item, err := db.GetContentByHash(hash)
	if err != nil {
		writeError(w, 404, "content metadata not found")
		return
	}

	// Parse optional overrides from body
	var body struct {
		PriceSats     int    `json:"price_sats"`
		ServerAddress string `json:"server_address"`
	}
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&body)
	}

	priceSats := item.PricePaidSats
	if body.PriceSats > 0 {
		priceSats = body.PriceSats
	}

	serverAddr := body.ServerAddress
	if serverAddr == "" {
		// Use daemon wallet address
		walletStatus := s.daemon.WalletStatus()
		if addr, ok := walletStatus["address"].(string); ok {
			serverAddr = addr
		}
	}

	s.contentAnnouncer(item.TokenID, item.ContentHash, item.ContentSize, item.ContentType, priceSats, serverAddr)

	writeJSON(w, map[string]interface{}{
		"announced":    true,
		"content_hash": hash,
		"price_sats":   priceSats,
		"server_addr":  serverAddr,
	})
}
