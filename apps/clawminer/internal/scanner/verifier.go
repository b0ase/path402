package scanner

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// VerificationResult holds the outcome of cross-verifying a token.
type VerificationResult struct {
	Status    string `json:"status"`     // "cross-verified" or "disputed"
	Reason    string `json:"reason"`     // empty if verified, description if disputed
	Source    string `json:"source"`     // "woc", "1sat", or "woc+1sat"
	VerifyAt  int64  `json:"verify_at"`  // unix timestamp
}

// BSV20Inscription is the parsed content of a BSV-20 deploy inscription.
type BSV20Inscription struct {
	Protocol string `json:"p"`    // "bsv-20"
	Op       string `json:"op"`   // "deploy", "mint", "transfer"
	Tick     string `json:"tick"` // token ticker
	Max      string `json:"max"`  // max supply
	Lim      string `json:"lim"`  // mint limit per tx
	Amt      string `json:"amt"`  // amount (for mint/transfer)
}

// Verifier cross-verifies token data from GorillaPool against on-chain sources.
type Verifier struct {
	woc    *WocClient
	oneSat *OneSatClient
}

// NewVerifier creates a cross-verification engine.
func NewVerifier(woc *WocClient, oneSat *OneSatClient) *Verifier {
	return &Verifier{woc: woc, oneSat: oneSat}
}

// VerifyToken checks a token's deploy inscription on-chain and compares with GorillaPool data.
func (v *Verifier) VerifyToken(ctx context.Context, tick, txid string, gorillaSupply, gorillaMax int) (*VerificationResult, error) {
	result := &VerificationResult{
		VerifyAt: time.Now().Unix(),
	}

	// Step 1: Fetch raw tx from WhatsOnChain
	rawHex, err := v.woc.FetchRawTx(ctx, txid)
	if err != nil {
		return nil, fmt.Errorf("woc fetch raw tx %s: %w", txid[:min(16, len(txid))], err)
	}

	// Step 2: Parse inscription from raw transaction hex
	inscription, err := parseInscription(rawHex)
	if err != nil {
		// Can't parse inscription — might not be a BSV-20 deploy tx
		// Still try 1Sat as fallback
		log.Printf("[verifier] Inscription parse failed for %s: %v (trying 1Sat fallback)", tick, err)
		return v.fallbackOneSat(ctx, tick, gorillaSupply, gorillaMax, result)
	}

	// Step 3: Compare on-chain inscription against GorillaPool values
	var disputes []string
	result.Source = "woc"

	// Check tick matches
	if !strings.EqualFold(inscription.Tick, tick) {
		disputes = append(disputes, fmt.Sprintf("tick mismatch: on-chain=%q gorilla=%q", inscription.Tick, tick))
	}

	// Check max supply matches (compare as strings since on-chain is string)
	if inscription.Max != "" {
		onChainMax := inscription.Max
		gorillaMaxStr := fmt.Sprintf("%d", gorillaMax)
		if onChainMax != gorillaMaxStr {
			disputes = append(disputes, fmt.Sprintf("max mismatch: on-chain=%s gorilla=%s", onChainMax, gorillaMaxStr))
		}
	}

	// Step 4: Optional 1Sat cross-check for supply
	if v.oneSat != nil {
		oneSatInfo, err := v.oneSat.FetchTokenSupply(ctx, tick)
		if err == nil {
			result.Source = "woc+1sat"
			oneSatSupply := int(oneSatInfo.Supply)
			// Allow small supply drift (tokens being minted in real time)
			supplyDiff := abs(oneSatSupply - gorillaSupply)
			maxDrift := max(gorillaSupply/100, 1000) // 1% or 1000, whichever is larger
			if supplyDiff > maxDrift {
				disputes = append(disputes, fmt.Sprintf("supply drift: gorilla=%d 1sat=%d (diff=%d)", gorillaSupply, oneSatSupply, supplyDiff))
			}
		}
		// 1Sat errors are non-fatal — we still have WoC data
	}

	if len(disputes) > 0 {
		result.Status = "disputed"
		result.Reason = strings.Join(disputes, "; ")
	} else {
		result.Status = "cross-verified"
	}

	return result, nil
}

// fallbackOneSat attempts verification using only the 1Sat market data.
func (v *Verifier) fallbackOneSat(ctx context.Context, tick string, gorillaSupply, gorillaMax int, result *VerificationResult) (*VerificationResult, error) {
	if v.oneSat == nil {
		return nil, fmt.Errorf("no verification source available for %s", tick)
	}

	info, err := v.oneSat.FetchTokenSupply(ctx, tick)
	if err != nil {
		return nil, fmt.Errorf("1sat fallback failed for %s: %w", tick, err)
	}

	result.Source = "1sat"
	var disputes []string

	// Check max supply
	oneSatMax := int(info.Max)
	if oneSatMax != gorillaMax && oneSatMax > 0 {
		disputes = append(disputes, fmt.Sprintf("max mismatch: 1sat=%d gorilla=%d", oneSatMax, gorillaMax))
	}

	// Check supply drift
	oneSatSupply := int(info.Supply)
	supplyDiff := abs(oneSatSupply - gorillaSupply)
	maxDrift := max(gorillaSupply/100, 1000)
	if supplyDiff > maxDrift {
		disputes = append(disputes, fmt.Sprintf("supply drift: gorilla=%d 1sat=%d (diff=%d)", gorillaSupply, oneSatSupply, supplyDiff))
	}

	if len(disputes) > 0 {
		result.Status = "disputed"
		result.Reason = strings.Join(disputes, "; ")
	} else {
		result.Status = "cross-verified"
	}
	return result, nil
}

// parseInscription extracts a BSV-20 JSON payload from a raw transaction hex.
//
// BSV ordinal inscriptions use an OP_FALSE OP_IF envelope:
//
//	OP_FALSE (0x00) OP_IF (0x63)
//	  OP_PUSH "ord" (0x03 6f7264)
//	  OP_PUSH content-type
//	  OP_0 (separator)
//	  OP_PUSH payload
//	OP_ENDIF (0x68)
func parseInscription(rawHex string) (*BSV20Inscription, error) {
	rawHex = strings.TrimSpace(rawHex)
	data, err := hex.DecodeString(rawHex)
	if err != nil {
		return nil, fmt.Errorf("hex decode: %w", err)
	}

	// Scan for the OP_FALSE OP_IF envelope marker
	ordMarker := []byte{0x6f, 0x72, 0x64} // "ord"
	ordIdx := -1
	for i := 0; i < len(data)-5; i++ {
		// Look for: 0x00 0x63 ... 0x03 "ord"
		if data[i] == 0x00 && data[i+1] == 0x63 {
			// Found OP_FALSE OP_IF, now scan forward for "ord" marker
			for j := i + 2; j < len(data)-3 && j < i+50; j++ {
				if data[j] == 0x03 && data[j+1] == ordMarker[0] && data[j+2] == ordMarker[1] && data[j+3] == ordMarker[2] {
					ordIdx = j + 4 // position after "ord"
					break
				}
			}
			if ordIdx >= 0 {
				break
			}
		}
	}

	if ordIdx < 0 {
		return nil, fmt.Errorf("no ordinal inscription envelope found")
	}

	// After "ord" marker, scan for the JSON payload.
	// The content type and payload are push-data encoded.
	// We look for the JSON opening brace.
	jsonStart := -1
	for i := ordIdx; i < len(data); i++ {
		if data[i] == '{' {
			jsonStart = i
			break
		}
	}
	if jsonStart < 0 {
		return nil, fmt.Errorf("no JSON payload found in inscription")
	}

	// Find the matching closing brace
	depth := 0
	jsonEnd := -1
	for i := jsonStart; i < len(data); i++ {
		switch data[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				jsonEnd = i + 1
				break
			}
		}
		if jsonEnd >= 0 {
			break
		}
	}
	if jsonEnd < 0 {
		return nil, fmt.Errorf("unterminated JSON in inscription")
	}

	payload := data[jsonStart:jsonEnd]

	var insc BSV20Inscription
	if err := json.Unmarshal(payload, &insc); err != nil {
		return nil, fmt.Errorf("parse inscription JSON: %w", err)
	}

	if insc.Protocol == "" || (insc.Protocol != "bsv-20" && insc.Protocol != "bsv20") {
		return nil, fmt.Errorf("not a BSV-20 inscription (p=%q)", insc.Protocol)
	}

	return &insc, nil
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
