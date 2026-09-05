import crypto from 'crypto';
import { readEtaPrivateKey } from './eta-config.js';

/**
 * ===== التوقيعات الرقمية لمنظومة الفاتورة الإلكترونية (ETA) =====
 * 1) توقيع المستند: توقيع RSA-SHA256 على الهيئة القانونية (canonical form)
 *    للمستند وفق معيار ETA (مكافئ لخوارزمية "revert/brute-force" الرسمية
 *    عبر الدالة SHA256 ثم RSA للتشفير بالتوقيع).
 * 2) فك تشفير المفتاح الخاص: يدعم PEM غير مشفّر، وPKCS#8، و PKCS#1 (RSA PRIVATE KEY).
 *
 * عند غياب المفتاح الخاص نُصدِر "توقيع محاكاة" مميز بوضوح حتى لا يُرسل
 * أي مستند حقيقي إلى بوابة الضرائب بحال لم يتم التهيئة.
 */

/** التوقيع بصيغة base64 الخاصة بـ ETA */
export function signEtaDocument(payload: string, privateKeyPem?: string | null): {
  digestValue: string;
  signatureValue: string;
  signingTime: string;
  simulated: boolean;
} {
  const signingTime = new Date().toISOString();
  const digest = crypto.createHash('sha256').update(payload, 'utf8').digest('base64');

  const keyPem = privateKeyPem ?? readEtaPrivateKey();
  if (!keyPem) {
    // وضع المحاكاة: توقيع أمثل عملياً لكنه غير صالح لدى البوابة الحقيقية
    return {
      digestValue: digest,
      signatureValue: `SIMULATED_SIG_${digest.substring(0, 32)}`,
      signingTime,
      simulated: true,
    };
  }

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payload, 'utf8');
  signer.end();
  const signature = signer.sign(keyPem, 'base64');

  return {
    digestValue: digest,
    signatureValue: signature,
    signingTime,
    simulated: false,
  };
}

/**
 * توقيع طلب رأس المصادقة (Standard 1.0):
 * يحسب HMAC على (timeStamp + '/' + uri) بمفتاح = سر العميل وفق المعيار.
 */
export function buildEtaRequestSigning({
  clientId,
  clientSecret,
  uri,
  method,
  body,
  timestamp,
}: {
  clientId: string;
  clientSecret: string;
  uri: string;
  method: string;
  body?: string;
  timestamp?: string;
}): { timestamp: string; signature: string } {
  const ts = timestamp ?? new Date().toUTCString();
  const payload = body && body.length > 0 ? `${method} ${uri}${ts}${body}` : `${method} ${uri}${ts}`;
  const hmac = crypto.createHmac('sha256', clientSecret).update(payload, 'utf8').digest('base64');
  return { timestamp: ts, signature: hmac };
}

/** مولّد UUID/معرّف داخلي فريد (لضمان تفرد إرسال المستندات) */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** يقيس بصمة HMAC لدمج الأمان عند الإرسال (توقيع النقل المحلي) */
export function sha256local(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
