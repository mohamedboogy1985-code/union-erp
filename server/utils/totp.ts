import crypto from 'crypto';

/**
 * ===== IMPROVEMENTS.md 5.1: التحقق متعدد المستويات (2FA - TOTP RFC 6238) =====
 * تنفيذ ذاتي خفيف لبروتوكول TOTP بدون اعتماديات خارجية، متوافق مع Google Authenticator.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** توليد سر Base32 عشوائي (160 بت) */
export function generateTotpSecret(lengthBytes: number = 20): string {
  const buffer = crypto.randomBytes(lengthBytes);
  return base32Encode(buffer);
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * توليد رمز TOTP الحالي للسر المُعطى
 */
export function generateTotp(secretBase32: string, timeStepSeconds: number = 30, digits: number = 6): string {
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * التحقق من رمز TOTP مع نافذة تسامح ±1 خطوة زمنية (لمعالجة انحراف الساعة)
 */
export function verifyTotp(token: string, secretBase32: string, window: number = 1, timeStepSeconds: number = 30): boolean {
  const cleanToken = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  for (let offset = -window; offset <= window; offset++) {
    const expected = hotp(base32Decode(secretBase32), counter + offset, cleanToken.length);
    // مقارنة ثابتة الزمن لمنع هجمات التوقيت
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanToken))) {
      return true;
    }
  }
  return false;
}

/** HMAC-based One-Time Password (RFC 4226) */
function hotp(key: Buffer, counter: number, digits: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter % 2 ** 32, 4);

  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * رابط إعداد otpauth:// لتطبيحات المصادقة (QR)
 */
export function buildOtpAuthUrl(secretBase32: string, accountLabel: string, issuer: string = 'Union ERP'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
