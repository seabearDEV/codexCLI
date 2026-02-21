package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	prefix          = "encrypted::v1:"
	saltLength      = 32
	ivLength        = 12
	authTagLength   = 16
	keyLength       = 32
	pbkdf2Iterations = 600_000
	minPayloadLen   = saltLength + ivLength + authTagLength
)

// IsEncrypted returns true if the value has the encryption prefix.
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, prefix)
}

// EncryptValue encrypts plaintext using AES-256-GCM with PBKDF2 key derivation.
// The output format is: encrypted::v1:<base64(salt + iv + authTag + ciphertext)>
func EncryptValue(plaintext, password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	iv := make([]byte, ivLength)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}

	key := pbkdf2.Key([]byte(password), salt, pbkdf2Iterations, keyLength, sha256.New)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Seal appends ciphertext + authTag
	sealed := aesGCM.Seal(nil, iv, []byte(plaintext), nil)

	// sealed = ciphertext + authTag (GCM appends tag at end)
	// We need: salt + iv + authTag + ciphertext (to match TypeScript format)
	ciphertextLen := len(sealed) - authTagLength
	ciphertext := sealed[:ciphertextLen]
	authTag := sealed[ciphertextLen:]

	payload := make([]byte, 0, saltLength+ivLength+authTagLength+ciphertextLen)
	payload = append(payload, salt...)
	payload = append(payload, iv...)
	payload = append(payload, authTag...)
	payload = append(payload, ciphertext...)

	return prefix + base64.StdEncoding.EncodeToString(payload), nil
}

// DecryptValue decrypts an encrypted value string.
func DecryptValue(encrypted, password string) (string, error) {
	if !IsEncrypted(encrypted) {
		return "", errors.New("value is not encrypted")
	}

	payload, err := base64.StdEncoding.DecodeString(encrypted[len(prefix):])
	if err != nil {
		return "", errors.New("corrupted encrypted data")
	}

	if len(payload) < minPayloadLen {
		return "", errors.New("corrupted encrypted data")
	}

	salt := payload[:saltLength]
	iv := payload[saltLength : saltLength+ivLength]
	authTag := payload[saltLength+ivLength : saltLength+ivLength+authTagLength]
	ciphertext := payload[saltLength+ivLength+authTagLength:]

	key := pbkdf2.Key([]byte(password), salt, pbkdf2Iterations, keyLength, sha256.New)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", errors.New("decryption failed. Wrong password or corrupted data")
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", errors.New("decryption failed. Wrong password or corrupted data")
	}

	// Reassemble: ciphertext + authTag (Go's GCM expects tag appended)
	sealed := make([]byte, 0, len(ciphertext)+authTagLength)
	sealed = append(sealed, ciphertext...)
	sealed = append(sealed, authTag...)

	plaintext, err := aesGCM.Open(nil, iv, sealed, nil)
	if err != nil {
		return "", errors.New("decryption failed. Wrong password or corrupted data")
	}

	return string(plaintext), nil
}

// MaskEncryptedValues replaces encrypted values with "[encrypted]" in a map.
func MaskEncryptedValues(data map[string]any) map[string]any {
	result := make(map[string]any, len(data))
	for k, v := range data {
		switch val := v.(type) {
		case string:
			if IsEncrypted(val) {
				result[k] = "[encrypted]"
			} else {
				result[k] = val
			}
		case map[string]any:
			result[k] = MaskEncryptedValues(val)
		default:
			result[k] = v
		}
	}
	return result
}
