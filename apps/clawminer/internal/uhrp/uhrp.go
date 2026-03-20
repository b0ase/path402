package uhrp

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// ComputeUhrpURL computes a UHRP URL from a SHA-256 hash.
func ComputeUhrpURL(hash [32]byte) string {
	return "uhrp://" + hex.EncodeToString(hash[:])
}

// ComputeUhrpURLFromHex computes a UHRP URL from a hex-encoded hash string.
func ComputeUhrpURLFromHex(hashHex string) (string, error) {
	hashHex = strings.ToLower(hashHex)
	if len(hashHex) != 64 {
		return "", fmt.Errorf("invalid hash length: expected 64 hex chars, got %d", len(hashHex))
	}
	// Validate hex
	if _, err := hex.DecodeString(hashHex); err != nil {
		return "", fmt.Errorf("invalid hex: %w", err)
	}
	return "uhrp://" + hashHex, nil
}

// ComputeUhrpURLFromData computes a UHRP URL from raw data.
func ComputeUhrpURLFromData(data []byte) string {
	hash := sha256.Sum256(data)
	return ComputeUhrpURL(hash)
}

// ParseUhrpURL extracts the SHA-256 hash from a UHRP URL.
func ParseUhrpURL(url string) ([32]byte, error) {
	var hash [32]byte
	if !strings.HasPrefix(url, "uhrp://") {
		return hash, fmt.Errorf("invalid UHRP URL: must start with uhrp://")
	}
	hashHex := url[7:]
	if len(hashHex) != 64 {
		return hash, fmt.Errorf("invalid UHRP URL: hash must be 64 hex chars")
	}
	decoded, err := hex.DecodeString(hashHex)
	if err != nil {
		return hash, fmt.Errorf("invalid UHRP URL: %w", err)
	}
	copy(hash[:], decoded)
	return hash, nil
}

// IsValidURL checks if a string is a valid UHRP URL.
func IsValidURL(url string) bool {
	_, err := ParseUhrpURL(url)
	return err == nil
}

// HashToHex converts a [32]byte hash to lowercase hex string.
func HashToHex(hash [32]byte) string {
	return hex.EncodeToString(hash[:])
}

// BuildAdvertisement creates a UHRP advertisement from content metadata.
func BuildAdvertisement(contentHash, contentType string, contentSize int, downloadURL, advertiser string, expiryDays int) Advertisement {
	var expiry int64
	if expiryDays > 0 {
		expiry = time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour).Unix()
	}

	uhrpURL, _ := ComputeUhrpURLFromHex(contentHash)

	return Advertisement{
		ContentHash: contentHash,
		UhrpURL:     uhrpURL,
		ContentType: contentType,
		ContentSize: contentSize,
		DownloadURL: downloadURL,
		Advertiser:  advertiser,
		Expiry:      expiry,
		CreatedAt:   time.Now().Unix(),
	}
}
