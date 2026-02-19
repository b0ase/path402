package mining

import (
	"encoding/hex"
	"fmt"
	"log"
	"strings"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/broadcaster"
	feemodel "github.com/bsv-blockchain/go-sdk/transaction/fee_model"
	"github.com/bsv-blockchain/go-sdk/transaction/template/p2pkh"
)

// BSVBroadcaster builds and broadcasts BSV transactions natively using go-sdk.
// It creates an OP_RETURN transaction inscribing the Proof-of-Indexing work
// commitment (merkle root) on-chain, then broadcasts via ARC.
type BSVBroadcaster struct {
	privKey      *ec.PrivateKey
	address      *script.Address
	arcURL       string
	arcAPIKey    string
	tokenID      string
	utxoProvider UTXOProvider
}

// UTXO represents an unspent transaction output for funding.
type UTXO struct {
	TxID          string
	Vout          uint32
	Satoshis      uint64
	LockingScript string // hex-encoded locking script
}

// UTXOProvider fetches unspent outputs for a given address.
type UTXOProvider interface {
	GetUTXOs(address string) ([]UTXO, error)
}

// BSVBroadcasterConfig holds configuration for the native broadcaster.
type BSVBroadcasterConfig struct {
	PrivateKey *ec.PrivateKey
	ArcURL     string // e.g. "https://arc.taal.com"
	ArcAPIKey  string // optional
	TokenID    string // HTM contract txid
	UTXOs      UTXOProvider
}

// NewBSVBroadcaster creates a native BSV transaction broadcaster.
func NewBSVBroadcaster(cfg BSVBroadcasterConfig) (*BSVBroadcaster, error) {
	addr, err := script.NewAddressFromPublicKey(cfg.PrivateKey.PubKey(), true)
	if err != nil {
		return nil, fmt.Errorf("derive address: %w", err)
	}

	arcURL := cfg.ArcURL
	if arcURL == "" {
		arcURL = "https://arc.taal.com"
	}

	return &BSVBroadcaster{
		privKey:      cfg.PrivateKey,
		address:      addr,
		arcURL:       arcURL,
		arcAPIKey:    cfg.ArcAPIKey,
		tokenID:      cfg.TokenID,
		utxoProvider: cfg.UTXOs,
	}, nil
}

// BroadcastMint builds and broadcasts an OP_RETURN transaction containing:
//   - Protocol tag: "$402"
//   - Action: "poi" (Proof of Indexing)
//   - Token ID
//   - Merkle root (32-byte work commitment)
//   - Miner address
func (b *BSVBroadcaster) BroadcastMint(merkleRoot string) (*MintBroadcasterResult, error) {
	// Fetch UTXOs for funding
	utxos, err := b.utxoProvider.GetUTXOs(b.address.AddressString)
	if err != nil {
		return nil, fmt.Errorf("get utxos: %w", err)
	}
	if len(utxos) == 0 {
		return &MintBroadcasterResult{
			Success: false,
			Error:   "no UTXOs available for funding",
			Action:  "retry",
		}, nil
	}

	// Build the transaction
	tx := transaction.NewTransaction()

	// Add funding inputs
	unlock, err := p2pkh.Unlock(b.privKey, nil)
	if err != nil {
		return nil, fmt.Errorf("unlock template: %w", err)
	}

	for _, utxo := range utxos {
		if err := tx.AddInputFrom(utxo.TxID, utxo.Vout, utxo.LockingScript, utxo.Satoshis, unlock); err != nil {
			return nil, fmt.Errorf("add input: %w", err)
		}
	}

	// OP_RETURN output with work commitment
	merkleBytes, err := hex.DecodeString(merkleRoot)
	if err != nil {
		// merkleRoot might not be hex — use as raw string
		merkleBytes = []byte(merkleRoot)
	}

	opReturn := &script.Script{}
	if err := opReturn.AppendOpcodes(script.OpFALSE, script.OpRETURN); err != nil {
		return nil, fmt.Errorf("append opcodes: %w", err)
	}
	if err := opReturn.AppendPushDataArray([][]byte{
		[]byte("$402"),                    // Protocol tag
		[]byte("poi"),                     // Proof of Indexing
		[]byte(b.tokenID),                 // Token ID
		merkleBytes,                       // Work commitment (merkle root)
		[]byte(b.address.AddressString),   // Miner address
	}); err != nil {
		return nil, fmt.Errorf("append push data: %w", err)
	}

	tx.AddOutput(&transaction.TransactionOutput{
		Satoshis:      0,
		LockingScript: opReturn,
	})

	// Change output back to miner
	changeScript, err := p2pkh.Lock(b.address)
	if err != nil {
		return nil, fmt.Errorf("change script: %w", err)
	}
	tx.AddOutput(&transaction.TransactionOutput{
		LockingScript: changeScript,
		Change:        true,
	})

	// Calculate fee (1 sat/KB — BSV is cheap)
	fm := &feemodel.SatoshisPerKilobyte{Satoshis: 1000}
	if err := tx.Fee(fm, transaction.ChangeDistributionEqual); err != nil {
		return nil, fmt.Errorf("fee calculation: %w", err)
	}

	// Sign
	if err := tx.Sign(); err != nil {
		return nil, fmt.Errorf("sign tx: %w", err)
	}

	txid := tx.TxID().String()
	log.Printf("[mining] Built PoI tx: %s (%d bytes)", txid, len(tx.Bytes()))

	// Broadcast via ARC
	arc := &broadcaster.Arc{
		ApiUrl: b.arcURL,
		ApiKey: b.arcAPIKey,
	}

	success, failure := tx.Broadcast(arc)
	if failure != nil {
		errMsg := failure.Description
		// Classify UTXO contention errors as retryable
		if isUTXOContention(errMsg) {
			return &MintBroadcasterResult{
				Success: false,
				Error:   errMsg,
				Action:  "retry",
			}, nil
		}
		return &MintBroadcasterResult{
			Success: false,
			Error:   errMsg,
			Action:  "done",
		}, nil
	}

	return &MintBroadcasterResult{
		Success: true,
		Txid:    success.Txid,
		Action:  "done",
	}, nil
}

// isUTXOContention checks if the error indicates another miner spent the UTXO.
func isUTXOContention(errMsg string) bool {
	lower := strings.ToLower(errMsg)
	return strings.Contains(lower, "utxo_spent") ||
		strings.Contains(lower, "txn-mempool-conflict") ||
		strings.Contains(lower, "missing inputs") ||
		strings.Contains(lower, "double spend")
}

// ── WhatsOnChain UTXO Provider ───────────────────────────────────
// Free, no API key required.

// WocUTXOProvider fetches UTXOs from WhatsOnChain.
type WocUTXOProvider struct {
	Network string // "main" or "test"
}

// NewWocUTXOProvider creates a WOC UTXO provider for mainnet.
func NewWocUTXOProvider() *WocUTXOProvider {
	return &WocUTXOProvider{Network: "main"}
}

type wocUTXO struct {
	TxHash string `json:"tx_hash"`
	TxPos  uint32 `json:"tx_pos"`
	Value  uint64 `json:"value"`
	Height int    `json:"height"`
}

// GetUTXOs fetches unspent outputs from WhatsOnChain.
func (w *WocUTXOProvider) GetUTXOs(address string) ([]UTXO, error) {
	url := fmt.Sprintf("https://api.whatsonchain.com/v1/bsv/%s/address/%s/unspent", w.Network, address)

	resp, err := defaultHTTPClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("WOC request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("WOC status %d", resp.StatusCode)
	}

	var wocUtxos []wocUTXO
	if err := decodeJSON(resp.Body, &wocUtxos); err != nil {
		return nil, fmt.Errorf("decode WOC response: %w", err)
	}

	// For each UTXO we need the locking script. Fetch from tx details.
	utxos := make([]UTXO, 0, len(wocUtxos))
	for _, wu := range wocUtxos {
		lockingScript, err := w.fetchLockingScript(wu.TxHash, wu.TxPos)
		if err != nil {
			log.Printf("[mining] Skip UTXO %s:%d (can't fetch script): %v", wu.TxHash, wu.TxPos, err)
			continue
		}
		utxos = append(utxos, UTXO{
			TxID:          wu.TxHash,
			Vout:          wu.TxPos,
			Satoshis:      wu.Value,
			LockingScript: lockingScript,
		})
	}

	return utxos, nil
}

type wocTxOut struct {
	Value        float64 `json:"value"`
	N            uint32  `json:"n"`
	ScriptPubKey struct {
		Hex string `json:"hex"`
	} `json:"scriptPubKey"`
}

type wocTx struct {
	Vout []wocTxOut `json:"vout"`
}

func (w *WocUTXOProvider) fetchLockingScript(txid string, vout uint32) (string, error) {
	url := fmt.Sprintf("https://api.whatsonchain.com/v1/bsv/%s/tx/hash/%s", w.Network, txid)

	resp, err := defaultHTTPClient.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tx wocTx
	if err := decodeJSON(resp.Body, &tx); err != nil {
		return "", err
	}

	for _, out := range tx.Vout {
		if out.N == vout {
			return out.ScriptPubKey.Hex, nil
		}
	}
	return "", fmt.Errorf("vout %d not found in tx %s", vout, txid)
}
