/**
 * ===== خدمة تشفير مكتبة النماذج (القفل بكلمة مرور) =====
 * - التشفير: AES-256-GCM مع اشتقاق مفتاح PBKDF2-SHA256 لكل ملف (salt/iv عشوائي لكل ملف).
 * - الهيكل الثنائي للملف المشفَّر: MAGIC(4) + VERSION(1) + salt(16) + iv(12) + authTag(16) + ciphertext.
 * - كلمة المرور لا تُخزَّن إلا في ذاكرة العمليات (process memory) ولا تُرفع على GitHub أبداً.
 */
import crypto from 'crypto';

const MAGIC = Buffer.from('UPM1', 'utf8'); // 4 bytes
const VERSION = 1;
const PBKDF2_ITERATIONS = 300_000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN + TAG_LEN;

let sessionPassword: string | null = null;

export function isLocked(): boolean {
  return sessionPassword === null;
}

export function isEncryptedBuffer(buf: Buffer): boolean {
  return buf.length >= HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

/** تشفير بيانات صريحة إلى حاوية UPM1 */
export function encryptBuffer(plain: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, tag, ct]);
}

/** فك تشفير حاوية UPM1 إلى البيانات الصريحة */
export function decryptBuffer(buf: Buffer, password: string): Buffer {
  if (!isEncryptedBuffer(buf)) throw new Error('الملف ليس بتنسيق مشفّر');
  const version = buf[MAGIC.length];
  if (version !== VERSION) throw new Error('إصدار تنسيق التشفير غير مدعوم');
  const salt = buf.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN);
  const iv = buf.subarray(MAGIC.length + 1 + SALT_LEN, MAGIC.length + 1 + SALT_LEN + IV_LEN);
  const tag = buf.subarray(MAGIC.length + 1 + SALT_LEN + IV_LEN, HEADER_LEN);
  const ct = buf.subarray(HEADER_LEN);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('كلمة المرور غير صحيحة أو الملف تالف');
  }
}

/** محاولة فتح القفل بكلمة المرور (يخزّنها في الذاكرة فقط بعد تجربة حقيقية) */
export function tryUnlock(password: string, probeEncrypted: Buffer | null): boolean {
  if (!password || typeof password !== 'string' || !password.trim()) return false;
  if (probeEncrypted) {
    try {
      decryptBuffer(probeEncrypted, password);
    } catch {
      return false;
    }
  }
  sessionPassword = password;
  return true;
}

export function lock(): void {
  sessionPassword = null;
}

export function getSessionPassword(): string | null {
  return sessionPassword;
}