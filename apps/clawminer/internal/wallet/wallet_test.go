package wallet

import (
	"strings"
	"testing"
)

func TestLoad_KnownVector(t *testing.T) {
	// Known WIF → address mapping
	wif := "KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617"
	w, err := Load(wif)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	want := "1LoVGDgRs9hTfTNJNuXKSpywcbdvwRXpmK"
	if w.Address != want {
		t.Errorf("address = %s, want %s", w.Address, want)
	}
}

func TestLoad_AddressFormat(t *testing.T) {
	wif := "KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617"
	w, err := Load(wif)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !strings.HasPrefix(w.Address, "1") {
		t.Errorf("address %s doesn't start with '1'", w.Address)
	}
	if len(w.Address) < 25 || len(w.Address) > 34 {
		t.Errorf("address length %d is unusual", len(w.Address))
	}
}

func TestLoad_CompressedPubKey(t *testing.T) {
	wif := "KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617"
	w, err := Load(wif)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(w.PublicKey) != 33 {
		t.Errorf("pubkey length = %d, want 33 (compressed)", len(w.PublicKey))
	}
}

func TestGenerate(t *testing.T) {
	w, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if w.Address == "" {
		t.Error("generated wallet has empty address")
	}
	if w.WIF == "" {
		t.Error("generated wallet has empty WIF")
	}
	if w.PrivateKey == nil {
		t.Error("generated wallet has nil private key")
	}
	if len(w.PublicKey) != 33 {
		t.Errorf("pubkey length = %d, want 33 (compressed)", len(w.PublicKey))
	}
	if !strings.HasPrefix(w.Address, "1") {
		t.Errorf("generated address %s doesn't start with '1'", w.Address)
	}
	t.Logf("Generated: address=%s WIF=%s", w.Address, w.WIF)
}

func TestGenerate_Unique(t *testing.T) {
	w1, _ := Generate()
	w2, _ := Generate()
	if w1.Address == w2.Address {
		t.Error("two generated wallets have the same address")
	}
}

func TestSign(t *testing.T) {
	w, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	sig, err := w.Sign([]byte("test data"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if len(sig) == 0 {
		t.Error("signature is empty")
	}
	// DER signature starts with 0x30
	if sig[0] != 0x30 {
		t.Errorf("signature doesn't start with 0x30 (DER), got 0x%02x", sig[0])
	}
}

func TestSignHash(t *testing.T) {
	w, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	var hash [32]byte
	copy(hash[:], []byte("01234567890123456789012345678901"))
	sig, err := w.SignHash(hash)
	if err != nil {
		t.Fatalf("SignHash: %v", err)
	}
	if len(sig) == 0 {
		t.Error("signature is empty")
	}
	if sig[0] != 0x30 {
		t.Errorf("signature doesn't start with 0x30 (DER), got 0x%02x", sig[0])
	}
}

func TestLoad_Roundtrip(t *testing.T) {
	// Generate, encode to WIF, load from WIF, compare addresses
	w1, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	w2, err := Load(w1.WIF)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if w1.Address != w2.Address {
		t.Errorf("addresses don't match after roundtrip: %s != %s", w1.Address, w2.Address)
	}
}

func TestLoad_EmptyWIF(t *testing.T) {
	_, err := Load("")
	if err == nil {
		t.Error("expected error for empty WIF")
	}
}

func TestLoad_InvalidWIF(t *testing.T) {
	_, err := Load("notavalidwif")
	if err == nil {
		t.Error("expected error for invalid WIF")
	}
}
