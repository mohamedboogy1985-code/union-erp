import fs from 'fs';
import path from 'path';
import { moduleDir } from '../../utils/runtime-paths.js';

/**
 * ===== إعدادات منظومة الفاتورة الإلكترونية — مصلحة الضرائب المصرية (ETA) =====
 * جميع القيم تُقرأ من البيئة (.env). لا تُحفَظ أي بيانات اعتماد في الكود.
 *
 * البيئات:
 *  - test:        بيئة الاختبار (بيئة المطوّرين) — app.invoicing.eta.gov.eg
 *  - production:  البيئة الحية — invoicing.eta.gov.eg
 *
 * عند غياب بيانات الاعتماد أو المفتاح الخاص، يعمل النظام في "وضع المحاكاة"
 * (SIMULATION) الذي يردّ بنتائج واقعية لاختبار سير العمل دون إرسال أي مستند حقيقي.
 */

export interface EtaCredentials {
  clientId: string;
  clientSecret: string;
  privateKeyPath: string;
  grantType: string;
}

export interface EtaEndpoints {
  token: string;
  submit: string;
  query: string;
  verify: string;
  download: string;
  cancel: string;
  issuer: string;
  documents: string;
}

const DEFAULT_ISSUER = '877-640-100'; // رقم التسجيل الضريبي للنقابة العامة

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function defaultEndpoints(env: 'test' | 'production'): EtaEndpoints {
  const base =
    env === 'production'
      ? 'https://invoicing.eta.gov.eg'
      : 'https://app.invoicing.eta.gov.eg';
  return {
    token: `${base}/api/v1.0/auth/connect/token`,
    submit: `${base}/api/v1.0/documentsubmissions`,
    query: `${base}/api/v1.0/documentsubmissions`,
    verify: `${base}/api/v1.0/documents`,
    download: `${base}/api/v1.0/documents`,
    cancel: `${base}/api/v1.0/documents`,
    issuer: `${base}/api/v1.0/issuer`,
    documents: `${base}/api/v1.0/documents`,
  };
}

export function getEtaEnv(): 'test' | 'production' {
  const v = readEnv('ETA_ENV').toLowerCase();
  return v === 'production' ? 'production' : 'test';
}

export function getEtaCredentials(): EtaCredentials {
  return {
    clientId: readEnv('ETA_CLIENT_ID'),
    clientSecret: readEnv('ETA_CLIENT_SECRET'),
    privateKeyPath: readEnv('ETA_PRIVATE_KEY_PATH'),
    grantType: readEnv('ETA_GRANT_TYPE') || 'client_credentials',
  };
}

/** هل النظام مهيأ للربط الفعلي أم في وضع المحاكاة؟ */
export function isEtaConfigured(): boolean {
  const c = getEtaCredentials();
  const keyReady = c.privateKeyPath ? fs.existsSync(c.privateKeyPath) : false;
  if (c.clientId && c.privateKeyPath && keyReady) return true;
  if (c.clientId && !c.privateKeyPath && keyReady === false) return true; // مفاتيح ضمن PKI الافتراضي قابلة للتزود لاحقاً
  return !!c.clientId;
}

export function getEtaIssuer(): string {
  return DEFAULT_ISSUER;
}

/** يقرأ نص المفتاح الخاص (PEM). يرجع null إن لم يوجد. */
export function readEtaPrivateKey(): string | null {
  const c = getEtaCredentials();
  if (!c.privateKeyPath) return null;
  const resolved = path.isAbsolute(c.privateKeyPath)
    ? c.privateKeyPath
    : path.resolve(moduleDir(import.meta.url), '../../..', c.privateKeyPath);
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf-8');
}

export function getEtaEndpoints(): EtaEndpoints {
  return defaultEndpoints(getEtaEnv());
}

/** القيمة المرجعية لواجهة المستخدم (وضع التشغيل الحالي) */
export function getEtaStatus(): {
  environment: 'test' | 'production';
  configured: boolean;
  simulation: boolean;
  issuer: string;
} {
  const configured = isEtaConfigured();
  const privateKeyReady =
    getEtaCredentials().privateKeyPath && readEtaPrivateKey() !== null;
  return {
    environment: getEtaEnv(),
    configured,
    simulation: !configured || !privateKeyReady,
    issuer: getEtaIssuer(),
  };
}
