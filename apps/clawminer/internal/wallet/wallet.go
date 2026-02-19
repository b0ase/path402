package wallet

import (
	"crypto/rand"
	"fmt"
	"log"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	crypto "github.com/bsv-blockchain/go-sdk/primitives/hash"
	"github.com/bsv-blockchain/go-sdk/script"
)

// Wallet holds a secp256k1 private key and derived BSV address.
type Wallet struct {
	PrivateKey *ec.PrivateKey
	PublicKey  []byte // 33-byte compressed public key
	Address    string // Base58Check P2PKH address (mainnet)
	WIF       string // Original or generated WIF
}

// Load creates a wallet from a WIF-encoded private key.
func Load(wif string) (*Wallet, error) {
	if wif == "" {
		return nil, fmt.Errorf("no wallet key provided")
	}

	privKey, err := ec.PrivateKeyFromWif(wif)
	if err != nil {
		return nil, fmt.Errorf("decode WIF: %w", err)
	}

	pubKeyBytes := privKey.PubKey().Compressed()

	addr, err := script.NewAddressFromPublicKey(privKey.PubKey(), true)
	if err != nil {
		return nil, fmt.Errorf("derive address: %w", err)
	}

	log.Printf("[wallet] Loaded key, address: %s", addr.AddressString)
	return &Wallet{
		PrivateKey: privKey,
		PublicKey:  pubKeyBytes,
		Address:    addr.AddressString,
		WIF:       wif,
	}, nil
}

// Generate creates a new random wallet.
func Generate() (*Wallet, error) {
	privKey, err := ec.NewPrivateKey()
	if err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}

	pubKeyBytes := privKey.PubKey().Compressed()

	addr, err := script.NewAddressFromPublicKey(privKey.PubKey(), true)
	if err != nil {
		return nil, fmt.Errorf("derive address: %w", err)
	}

	wif := privKey.Wif()

	return &Wallet{
		PrivateKey: privKey,
		PublicKey:  pubKeyBytes,
		Address:    addr.AddressString,
		WIF:       wif,
	}, nil
}

// Sign produces a DER-encoded ECDSA signature of the double-SHA256 hash of data.
func (w *Wallet) Sign(data []byte) ([]byte, error) {
	hash := crypto.Sha256d(data)
	sig, err := w.PrivateKey.Sign(hash)
	if err != nil {
		return nil, fmt.Errorf("sign: %w", err)
	}
	return sig.Serialize(), nil
}

// SignHash signs a pre-computed 32-byte hash.
func (w *Wallet) SignHash(hash [32]byte) ([]byte, error) {
	sig, err := w.PrivateKey.Sign(hash[:])
	if err != nil {
		return nil, fmt.Errorf("sign hash: %w", err)
	}
	return sig.Serialize(), nil
}

// RandomBytes returns n random bytes.
func RandomBytes(n int) []byte {
	b := make([]byte, n)
	rand.Read(b)
	return b
}
