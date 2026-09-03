import { describe, it, expect, beforeEach } from '@jest/globals';
import { EncryptionService } from '../src/services/encryption.service';

/**
 * مجموعة اختبارات خدمة التشفير
 * Encryption Service Test Suite
 */
describe('Encryption Service', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = '1234567890123456';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'sensitive-data';
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle special characters', () => {
      const plaintext = 'أرقام الهاتف: 123-456-7890';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error on corrupted data', () => {
      const corrupted = 'invalid-base64-data-that-is-corrupted';

      expect(() => {
        encryptionService.decrypt(corrupted);
      }).toThrow();
    });
  });

  describe('hash', () => {
    it('should generate consistent hash', () => {
      const data = 'test-data';
      const hash1 = encryptionService.hash(data);
      const hash2 = encryptionService.hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different data', () => {
      const hash1 = encryptionService.hash('data1');
      const hash2 = encryptionService.hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate 64-character hex hash', () => {
      const hash = encryptionService.hash('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct hash', () => {
      const data = 'test-data';
      const hash = encryptionService.hash(data);
      const isValid = encryptionService.verifyHash(data, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = 'test-data';
      const wrongHash = encryptionService.hash('different-data');
      const isValid = encryptionService.verifyHash(data, wrongHash);

      expect(isValid).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate random token', () => {
      const token1 = encryptionService.generateToken();
      const token2 = encryptionService.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1).toBeDefined();
    });

    it('should respect custom token length', () => {
      const token = encryptionService.generateToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });
  });
});
