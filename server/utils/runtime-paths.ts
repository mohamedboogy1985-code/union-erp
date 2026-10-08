/**
 * مسارات موارد التشغيل المتوافقة مع كل الأوضاع:
 * - تطوير (tsx/ESM): من مجلد المصدر
 * - حزمة الإنتاج (esbuild/CJS): من dist-server
 * - تطبيق Electron المُغلَّف: من داخل asar (server/data + assets مضمّنة)
 * ملاحظة: import.meta.url تصبح undefined في حزممة CJS لذا نستخدم __dirname عند توفره.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export function moduleDir(importMetaUrl?: string): string {
  if (typeof __dirname !== 'undefined') return __dirname; // CJS bundle (Electron)
  if (importMetaUrl) return path.dirname(fileURLToPath(importMetaUrl)); // ESM dev
  return process.cwd();
}

/** أول ملف موجود من مرشحات نسبية تُجرب من عدة جذور */
export function resolveFirst(candidates: Array<string | undefined | null>): string | null {
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch { /* تجاهل */ }
  }
  return null;
}

/** الإصدار الاحتياطي عند تعذّر قراءة package.json (يُحدَّث مع كل إصدار عبر `npm version`) */
export const FALLBACK_APP_VERSION = '1.1.0';

let cachedAppVersion: string | null = null;

/**
 * إصدار التطبيق من package.json — مصدر واحد للحقيقة يظهر في /api/health وملفات الإصدار.
 * يُبحث عنه بجوار الوحدة (تطوير)، أو في المجلد الأعلى (حزمة dist-server / app.asar)،
 * ثم مجلد التشغيل الحالي؛ ويُتحقق من اسم الحزمة حتى لا يُلتقط package.json غريب.
 */
export function appVersion(importMetaUrl?: string): string {
  if (cachedAppVersion) return cachedAppVersion;
  const dir = moduleDir(importMetaUrl);
  const candidates = [
    path.join(dir, 'package.json'),
    path.join(dir, '..', 'package.json'),
    path.join(dir, '..', '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
      if (parsed?.name === 'union-app' && typeof parsed.version === 'string' && parsed.version.trim()) {
        cachedAppVersion = parsed.version.trim();
        return cachedAppVersion;
      }
    } catch { /* جرّب المرشح التالي */ }
  }
  cachedAppVersion = FALLBACK_APP_VERSION;
  return cachedAppVersion;
}
