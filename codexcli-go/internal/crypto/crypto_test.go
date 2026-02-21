package crypto

import (
	"strings"
	"testing"
)

func TestIsEncrypted(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"encrypted::v1:abc123", true},
		{"encrypted::v1:", true},
		{"plain text", false},
		{"encrypted::v2:abc", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := IsEncrypted(tt.input); got != tt.want {
			t.Errorf("IsEncrypted(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plaintext := "hello, world!"
	password := "test-password-123"

	encrypted, err := EncryptValue(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptValue() error = %v", err)
	}

	if !IsEncrypted(encrypted) {
		t.Errorf("encrypted value should have prefix")
	}

	if !strings.HasPrefix(encrypted, "encrypted::v1:") {
		t.Errorf("expected prefix 'encrypted::v1:', got %q", encrypted[:20])
	}

	decrypted, err := DecryptValue(encrypted, password)
	if err != nil {
		t.Fatalf("DecryptValue() error = %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("DecryptValue() = %q, want %q", decrypted, plaintext)
	}
}

func TestDecryptWrongPassword(t *testing.T) {
	encrypted, err := EncryptValue("secret", "correct-password")
	if err != nil {
		t.Fatalf("EncryptValue() error = %v", err)
	}

	_, err = DecryptValue(encrypted, "wrong-password")
	if err == nil {
		t.Error("expected decryption error with wrong password")
	}
}

func TestDecryptNotEncrypted(t *testing.T) {
	_, err := DecryptValue("plain text", "password")
	if err == nil {
		t.Error("expected error for non-encrypted value")
	}
}

func TestDecryptCorrupted(t *testing.T) {
	_, err := DecryptValue("encrypted::v1:invalidbase64!!!", "password")
	if err == nil {
		t.Error("expected error for corrupted data")
	}
}

func TestEncryptDifferentEachTime(t *testing.T) {
	plaintext := "same input"
	password := "same password"

	e1, _ := EncryptValue(plaintext, password)
	e2, _ := EncryptValue(plaintext, password)

	if e1 == e2 {
		t.Error("two encryptions of the same input should produce different output (random salt/iv)")
	}
}

func TestMaskEncryptedValues(t *testing.T) {
	input := map[string]any{
		"plain":  "visible",
		"secret": "encrypted::v1:abc123",
		"nested": map[string]any{
			"deep": "encrypted::v1:def456",
			"ok":   "fine",
		},
	}

	result := MaskEncryptedValues(input)

	if result["plain"] != "visible" {
		t.Errorf("plain value should be unchanged")
	}
	if result["secret"] != "[encrypted]" {
		t.Errorf("encrypted value should be masked")
	}
	nested := result["nested"].(map[string]any)
	if nested["deep"] != "[encrypted]" {
		t.Errorf("nested encrypted should be masked")
	}
	if nested["ok"] != "fine" {
		t.Errorf("nested plain should be unchanged")
	}
}
