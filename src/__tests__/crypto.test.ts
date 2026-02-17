import { encryptValue, decryptValue, isEncrypted } from '../utils/crypto';

describe('Crypto utilities', () => {
  const password = 'test-password-123';

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      const encrypted = encryptValue('hello', password);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plain values', () => {
      expect(isEncrypted('hello world')).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('encrypted::')).toBe(false);
      expect(isEncrypted('encrypted::v2:abc')).toBe(false);
    });

    it('returns true for the exact prefix format', () => {
      expect(isEncrypted('encrypted::v1:abc')).toBe(true);
    });
  });

  describe('encryptValue / decryptValue round-trip', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'sk-abc123';
      const encrypted = encryptValue(plaintext, password);
      expect(isEncrypted(encrypted)).toBe(true);
      expect(encrypted).not.toContain(plaintext);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('handles unicode text', () => {
      const plaintext = 'Hello \u{1F30D} \u00E9\u00E8\u00EA \u4F60\u597D';
      const encrypted = encryptValue(plaintext, password);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('handles empty string', () => {
      const encrypted = encryptValue('', password);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe('');
    });

    it('handles long values', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encryptValue(plaintext, password);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('handles multi-line values', () => {
      const plaintext = 'line1\nline2\nline3';
      const encrypted = encryptValue(plaintext, password);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for the same input (random salt/iv)', () => {
      const a = encryptValue('same', password);
      const b = encryptValue('same', password);
      expect(a).not.toBe(b);
      // Both should decrypt to the same value
      expect(decryptValue(a, password)).toBe('same');
      expect(decryptValue(b, password)).toBe('same');
    });
  });

  describe('decryptValue error handling', () => {
    it('throws on wrong password', () => {
      const encrypted = encryptValue('secret', password);
      expect(() => decryptValue(encrypted, 'wrong-password')).toThrow('Decryption failed');
    });

    it('throws on non-encrypted input', () => {
      expect(() => decryptValue('plain text', password)).toThrow('not encrypted');
    });

    it('throws on corrupted data (truncated payload)', () => {
      expect(() => decryptValue('encrypted::v1:abc', password)).toThrow('Corrupted');
    });

    it('throws on corrupted data (modified ciphertext)', () => {
      const encrypted = encryptValue('secret', password);
      // Modify a character in the base64 payload
      const prefix = 'encrypted::v1:';
      const payload = encrypted.slice(prefix.length);
      const corruptedPayload = payload.slice(0, -2) + 'XX';
      expect(() => decryptValue(prefix + corruptedPayload, password)).toThrow();
    });
  });
});
