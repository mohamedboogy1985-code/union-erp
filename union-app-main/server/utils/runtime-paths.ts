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
export function resolveFirst(candidates: string[]): string | null {
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* تجاهل */ }
  }
  return null;
}
