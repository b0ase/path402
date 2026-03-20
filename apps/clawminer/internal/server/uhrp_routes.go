package server

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
	"github.com/b0ase/path402/apps/clawminer/internal/uhrp"
)

// handleUhrpResolve resolves a UHRP content hash to download URLs.
// GET /api/uhrp/resolve/{hash}
func (s *Server) handleUhrpResolve(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, 400, "content hash required")
		return
	}

	urls, err := db.ResolveUhrpHash(hash)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	uhrpURL, _ := uhrp.ComputeUhrpURLFromHex(hash)

	writeJSON(w, map[string]interface{}{
		"content_hash":  hash,
		"uhrp_url":      uhrpURL,
		"download_urls":  urls,
		"local":          len(urls) > 0,
	})
}

// handleUhrpAdvertise creates a UHRP advertisement for local content.
// POST /api/uhrp/advertise
//
//	Body: { "content_hash", "content_type", "content_size", "download_url", "expiry_days" }
func (s *Server) handleUhrpAdvertise(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ContentHash string `json:"content_hash"`
		ContentType string `json:"content_type"`
		ContentSize int    `json:"content_size"`
		DownloadURL string `json:"download_url"`
		ExpiryDays  int    `json:"expiry_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}

	if body.ContentHash == "" || body.DownloadURL == "" {
		writeError(w, 400, "content_hash and download_url required")
		return
	}

	// Get advertiser address from wallet
	advertiser := ""
	walletStatus := s.daemon.WalletStatus()
	if addr, ok := walletStatus["address"].(string); ok {
		advertiser = addr
	}

	ad := uhrp.BuildAdvertisement(body.ContentHash, body.ContentType, body.ContentSize,
		body.DownloadURL, advertiser, body.ExpiryDays)

	if err := db.InsertUhrpAdvertisement(ad.ContentHash, ad.UhrpURL, ad.ContentType,
		ad.ContentSize, ad.DownloadURL, ad.Advertiser, ad.Expiry, ""); err != nil {
		writeError(w, 500, "failed to store advertisement: "+err.Error())
		return
	}

	// Broadcast to gossip network
	if s.uhrpAnnouncer != nil {
		s.uhrpAnnouncer(ad.ContentHash, ad.UhrpURL, ad.ContentType, ad.ContentSize, ad.DownloadURL, ad.Advertiser)
	}

	writeJSON(w, map[string]interface{}{
		"uhrp_url":      ad.UhrpURL,
		"content_hash":  ad.ContentHash,
		"advertisement": ad,
	})
}

// handleUhrpList returns active UHRP advertisements.
// GET /api/uhrp/advertisements?limit=100
func (s *Server) handleUhrpList(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}

	ads, err := db.GetUhrpAdvertisements(limit)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if ads == nil {
		ads = []db.UhrpAdvertisement{}
	}
	writeJSON(w, ads)
}
