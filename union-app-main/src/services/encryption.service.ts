import crypto from 'crypto';

/**
 * خدمة التشفير للبيانات الحساسة
 * Encryption service for sensitive data
 */
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  private ivLength = 16;
  private saltLength = 64;
  private tagLength = 16;
  private tagPosition = this.saltLength + this.ivLength;
  private encryptedPosition = this.tagPosition + this.tagLength;

  constructor(masterKey?: string) {
    // إذا لم يتم تمرير مفتاح، استخدم المفتاح من متغيرات البيئة
    const keySource = masterKey || process.env.ENCRYPTION_KEY || 'default-key';
    
    // استخلص مفتاح بطول 32 بايت من المفتاح المصدر
    this.key = crypto
      .createHash('sha256')
      .update(keySource)
      .digest();
  }

  /**
   * تشفير البيانات الحساسة
   * Encrypt sensitive data (card numbers, employee data, etc.)
   */
  encrypt(plaintext: string): string {
    try {
      // توليد salt عشوائي
      const salt = crypto.randomBytes(this.saltLength);
      
      // توليد IV عشوائي
      const iv = crypto.randomBytes(this.ivLength);
      
      // إنشاء الدالة الحسابية
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      // تشفير النص
      let encrypted = cipher.update(plaintext, 'utf8', 'binary');
      encrypted += cipher.final('binary');
      
      // الحصول على العلامة (tag)
      const tag = cipher.getAuthTag();
      
      // دمج جميع الأجزاء: salt + iv + tag + encrypted
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'binary')
      ]);
      
      // تحويل إلى base64 للتخزين
      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * فك تشفير البيانات
   * Decrypt sensitive data
   */
  decrypt(encrypted: string): string {
    try {
      // تحويل من base64
      const combined = Buffer.from(encrypted, 'base64');
      
      // استخلاص الأجزاء
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.tagPosition);
      const tag = combined.slice(this.tagPosition, this.encryptedPosition);
      const encryptedData = combined.slice(this.encryptedPosition);
      
      // إنشاء الدالة المعكوسة
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);
      
      // فك التشفير
      let decrypted = decipher.update(encryptedData.toString('binary'), 'binary', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * إنشاء هاش آمن للبيانات
   * Create secure hash of data
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * التحقق من هاش البيانات
   * Verify data hash
   */
  verifyHash(data: string, hash: string): boolean {
    return this.hash(data) === hash;
  }

  /**
   * إنشاء رمز عشوائي آمن
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

export const encryptionService = new EncryptionService();
