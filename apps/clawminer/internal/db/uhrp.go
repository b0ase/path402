package db

import "time"

// UhrpAdvertisement represents a stored UHRP content advertisement.
type UhrpAdvertisement struct {
	ContentHash    string `json:"content_hash"`
	UhrpURL        string `json:"uhrp_url"`
	ContentType    string `json:"content_type,omitempty"`
	ContentSize    int    `json:"content_size"`
	DownloadURL    string `json:"download_url"`
	Advertiser     string `json:"advertiser"`
	Expiry         int64  `json:"expiry,omitempty"`
	InscriptionTxid string `json:"inscription_txid,omitempty"`
	CreatedAt      int64  `json:"created_at"`
}

// InsertUhrpAdvertisement stores or updates a UHRP advertisement.
func InsertUhrpAdvertisement(contentHash, uhrpURL, contentType string, contentSize int, downloadURL, advertiser string, expiry int64, inscriptionTxid string) error {
	if db == nil {
		return nil
	}
	_, err := db.Exec(`
		INSERT INTO uhrp_advertisements (content_hash, uhrp_url, content_type, content_size, download_url, advertiser, expiry, inscription_txid, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(content_hash) DO UPDATE SET
			download_url = excluded.download_url,
			advertiser = excluded.advertiser,
			expiry = excluded.expiry,
			inscription_txid = COALESCE(excluded.inscription_txid, uhrp_advertisements.inscription_txid)
	`, contentHash, uhrpURL, contentType, contentSize, downloadURL, advertiser, expiry, inscriptionTxid, time.Now().Unix())
	return err
}

// GetUhrpAdvertisement looks up a UHRP advertisement by content hash.
func GetUhrpAdvertisement(contentHash string) (*UhrpAdvertisement, error) {
	if db == nil {
		return nil, nil
	}
	row := db.QueryRow(`SELECT content_hash, uhrp_url, content_type, content_size, download_url, advertiser, expiry, inscription_txid, created_at
		FROM uhrp_advertisements WHERE content_hash = ?`, contentHash)

	var ad UhrpAdvertisement
	var inscTxid *string
	err := row.Scan(&ad.ContentHash, &ad.UhrpURL, &ad.ContentType, &ad.ContentSize,
		&ad.DownloadURL, &ad.Advertiser, &ad.Expiry, &inscTxid, &ad.CreatedAt)
	if err != nil {
		return nil, err
	}
	if inscTxid != nil {
		ad.InscriptionTxid = *inscTxid
	}
	return &ad, nil
}

// GetUhrpAdvertisements returns all active UHRP advertisements.
func GetUhrpAdvertisements(limit int) ([]UhrpAdvertisement, error) {
	if db == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.Query(`SELECT content_hash, uhrp_url, content_type, content_size, download_url, advertiser, expiry, inscription_txid, created_at
		FROM uhrp_advertisements
		WHERE expiry = 0 OR expiry > ?
		ORDER BY created_at DESC
		LIMIT ?`, time.Now().Unix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ads []UhrpAdvertisement
	for rows.Next() {
		var ad UhrpAdvertisement
		var inscTxid *string
		if err := rows.Scan(&ad.ContentHash, &ad.UhrpURL, &ad.ContentType, &ad.ContentSize,
			&ad.DownloadURL, &ad.Advertiser, &ad.Expiry, &inscTxid, &ad.CreatedAt); err != nil {
			continue
		}
		if inscTxid != nil {
			ad.InscriptionTxid = *inscTxid
		}
		ads = append(ads, ad)
	}
	return ads, nil
}

// ResolveUhrpHash returns all download URLs for a content hash.
func ResolveUhrpHash(contentHash string) ([]string, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.Query(`SELECT download_url FROM uhrp_advertisements
		WHERE content_hash = ? AND (expiry = 0 OR expiry > ?)`,
		contentHash, time.Now().Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var urls []string
	for rows.Next() {
		var url string
		if err := rows.Scan(&url); err != nil {
			continue
		}
		urls = append(urls, url)
	}
	return urls, nil
}
