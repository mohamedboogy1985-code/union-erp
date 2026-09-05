/**
 * ===== خدمة مكتبة النماذج والمستندات (مجلد «نماذج») =====
 * - تدرج الملفات الموجودة في مجلد «نماذج» بمسار المشروع.
 * - تدعم التنزيل والعرض المضمّن والطباعة عبر نافذة النظام.
 * - تدعم إضافة ملف جديد، إعادة تسمية، استبدال المحتوى، وحذف الملفات.
 * - حلّ المسار متوافق مع: التطوير (cwd) وحزمة Electron (resources خارج asar).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';
import * as modelsCrypto from './models-crypto.service.js';

const _require = createRequire(import.meta.url);

const MODULE_DIR = moduleDir(typeof import.meta !== 'undefined' ? import.meta.url : undefined) || process.cwd();

export type ModelKind = 'image' | 'pdf' | 'office' | 'text' | 'archive' | 'other';

export interface ModelFileInfo {
  name: string;
  size: number;
  modifiedAt: string;
  ext: string;
  kind: ModelKind;
}

/** مجلد النماذج الذي تُدار منه الملفات (المسار المحدَّد) */
export function resolveModelsDir(): string {
  const candidates = [
    process.env.UNION_MODELS_DIR,
    path.join(process.cwd(), 'نماذج'),
    process.resourcesPath ? path.join(process.resourcesPath, 'نماذج') : null,
    path.join(MODULE_DIR, '..', '..', 'نماذج'),
  ].filter(Boolean) as string[];

  const existing = resolveFirst(candidates);
  if (existing) return existing;

  // إن لم يوجد أي مسار (حالة نادرة)، أنشئ المجلد بجانب بيانات الخادم
  const fallback = path.join(process.cwd(), 'نماذج');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {
    /* تجاهل */
  }
  return fallback;
}

export const MODELS_DIR = resolveModelsDir();

/** التصنيف حسب الامتداد */
function kindOf(ext: string): ModelKind {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'jfif', 'svg'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'xls', 'xlsx', 'xlsb', 'ppt', 'pptx', 'rtf', 'odt', 'ods'].includes(e)) return 'office';
  if (['txt', 'csv', 'md', 'json', 'xml', 'log'].includes(e)) return 'text';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'archive';
  return 'other';
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1);
}

/** تحقق من سلامة اسم الملف وعدم تسلّل المسار (يمنع ../ و /\ ويعيد المسار الكامل الآمن) */
export function safeModelPath(name: string): string {
  if (!name || typeof name !== 'string') throw new Error('اسم ملف غير صالح');
  const base = path.basename(String(name)).replace(/^\./, '');
  if (!base) throw new Error('اسم ملف غير صالح');
  if (/[\\/]/.test(name) || name.includes('..')) throw new Error('اسم الملف يحتوي مساراً غير صالح');
  return path.join(MODELS_DIR, base);
}

export function listModels(): ModelFileInfo[] {
  try {
    const entries = fs.readdirSync(MODELS_DIR);
    const files = entries.filter((f) => {
      const p = path.join(MODELS_DIR, f);
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
    return files
      .map((f) => {
        const full = path.join(MODELS_DIR, f);
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          return null;
        }
        return {
          name: f,
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
          ext: extOf(f),
          kind: kindOf(extOf(f)),
        } as ModelFileInfo;
      })
      .filter(Boolean) as ModelFileInfo[];
  } catch {
    return [];
  }
}

export function readModelBuffer(name: string): Buffer {
  const p = safeModelPath(name);
  if (!fs.existsSync(p)) throw new Error(`الملف [${name}] غير موجود`);
  const raw = fs.readFileSync(p);
  return decryptIfNeeded(name, raw);
}

/** فك التشفير عند الطلب (عندما يكون محتوى الملف مشفّراً)، مع رفض الوصول بلا كلمة مرور */
function decryptIfNeeded(name: string, raw: Buffer): Buffer {
  if (modelsCrypto.isEncryptedBuffer(raw)) {
    const pw = modelsCrypto.getSessionPassword();
    if (!pw) throw new ModelsLockedError(`مكتبة النماذج مقفلة — أدخل كلمة المرور لعرض ${name}`);
    try {
      return modelsCrypto.decryptBuffer(raw, pw);
    } catch (err: any) {
      // لو صلاحية منتهية/خطأ فك، نجعلها كما هي: مقفلة
      throw new ModelsLockedError(`تعذر فك تشفير ${name}: ${err.message}`);
    }
  }
  return raw;
}

/** خطأ يدل على أن المكتبة مقفلة بكلمة مرور (يُعرض في الواجهة كشاشة فتح) */
export class ModelsLockedError extends Error {
  status = 423;
  constructor(message: string) {
    super(message);
    this.name = 'ModelsLockedError';
  }
}

/** قراءة سطر أول كتلة مشفّرة من مجلد النماذج (للتجربة بكلمة المرور عند الفتح) */
export function probeFirstEncrypted(): Buffer | null {
  try {
    const entries = fs.readdirSync(MODELS_DIR);
    for (const f of entries) {
      const p = path.join(MODELS_DIR, f);
      try {
        if (!fs.statSync(p).isFile()) continue;
        const raw = fs.readFileSync(p);
        if (modelsCrypto.isEncryptedBuffer(raw)) return raw;
      } catch {
        /* ignore */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** حفظ/استبدال محتوى ملف من base64 (يُشفَّر عند التفعيل بقفل المكتبة) */
export function writeModel(name: string, contentBase64: string): ModelFileInfo {
  const p = safeModelPath(name);
  let buffer = Buffer.from(contentBase64 || '', 'base64');
  const pw = modelsCrypto.getSessionPassword();
  if (pw) {
    // المكتبة مقفلة: كُل الملفات المرسلة تُخزَّن مشفّرة
    buffer = modelsCrypto.encryptBuffer(buffer, pw);
  }
  fs.writeFileSync(p, buffer);
  return {
    name: path.basename(p),
    size: fs.existsSync(p) ? fs.statSync(p).size : buffer.length,
    modifiedAt: new Date().toISOString(),
    ext: extOf(path.basename(p)),
    kind: kindOf(extOf(path.basename(p))),
  };
}

/** إعادة تسمية ملف */
export function renameModel(oldName: string, newName: string): ModelFileInfo {
  const src = safeModelPath(oldName);
  const dst = safeModelPath(newName);
  if (!fs.existsSync(src)) throw new Error(`الملف [${oldName}] غير موجود`);
  if (fs.existsSync(dst)) throw new Error(`يوجد ملف بنفس الاسم [${newName}] مسبقاً`);
  fs.renameSync(src, dst);
  const full = readModelInfo(dst);
  return full;
}

export function readModelInfo(p: string): ModelFileInfo {
  const st = fs.statSync(p);
  const base = path.basename(p);
  return {
    name: base,
    size: st.size,
    modifiedAt: st.mtime.toISOString(),
    ext: extOf(base),
    kind: kindOf(extOf(base)),
  };
}

export function deleteModel(name: string): { name: string } {
  const p = safeModelPath(name);
  if (!fs.existsSync(p)) throw new Error(`الملف [${name}] غير موجود`);
  fs.unlinkSync(p);
  return { name: path.basename(p) };
}

/** نوع MIME تقريبي لخدمة الملفات */
export function mimeOf(name: string): string {
  const e = extOf(name).toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    txt: 'text/plain',
    csv: 'text/csv',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    log: 'text/plain',
    zip: 'application/zip',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jfif: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return map[e] || 'application/octet-stream';
}

/** تحويل وثيقة Office إلى PDF باستخدام تطبيقات ميكروسوفت أوفيس عبر COM (Word/Excel)
 *  ملاحظة: التحويل الفعلي يتم داخل renderModel عبر PowerShell/COM. */

/** عرض ملف بشكل قابل للمعاينة داخل الشاشة: الوثائق (Word/Excel) تُحوَّل إلى PDF، وغيرها يُعاد كما هو */
export function renderModel(name: string): { buffer: Buffer; mime: string; converted: boolean } {
  const p = safeModelPath(name);
  if (!fs.existsSync(p)) throw new Error(`الملف [${name}] غير موجود`);
  const ext = extOf(name).toLowerCase();
  const isWord = ext === 'doc' || ext === 'docx' || ext === 'rtf';
  const isExcel = ext === 'xls' || ext === 'xlsx' || ext === 'xlsb' || ext === 'csv';

  // قراءة وفك التشفير عند الحاجة
  const raw = fs.readFileSync(p);
  const plain = decryptIfNeeded(name, raw);

  // الصور وPDF وغيرها تُعرض مباشرة دون تحويل
  if (!isWord && !isExcel) {
    return { buffer: plain, mime: mimeOf(name), converted: false };
  }

  // تحويل Office → PDF عبر PowerShell + COM (Word/Excel)
  try {
    if (os.platform() !== 'win32') {
      return { buffer: plain, mime: mimeOf(name), converted: false };
    }
    // نكتب نسخة صريحة مؤقتة بلاحقة أصلية حتى يتعرف عليها Word/Excel (خاصة لو كان الملف مشفّراً)
    const tmpSrc = path.join(os.tmpdir(), `model-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || 'bin'}`);
    fs.writeFileSync(tmpSrc, plain);
    const tmpPdf = path.join(os.tmpdir(), `model-render-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    const appName = isWord ? 'Word.Application' : 'Excel.Application';
    const docOpen: string = isWord
      ? `$doc = $app.Documents.Open(${JSON.stringify(tmpSrc)}, $false, $true)`
      : `$wb = $app.Workbooks.Open(${JSON.stringify(tmpSrc)}, 0, $true); $app.DisplayAlerts = $false`;
    const ps =
      `$ErrorActionPreference='Stop'\n` +
      `$app = New-Object -ComObject ${appName}\n` +
      `$app.Visible = $false\n` +
      (isWord ? `$app.DisplayAlerts = 0\n` : ``) +
      docOpen + '\n' +
      (isWord ? `$doc.ExportAsFixedFormat(${JSON.stringify(tmpPdf)}, 17)\n` : `$wb.ExportAsFixedFormat(0, ${JSON.stringify(tmpPdf)})\n`) +
      (isWord ? `$doc.Close(0)\n` : `$wb.Close($false)\n`) +
      `$app.Quit()\n`;

    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 120000,
    });
    if (!fs.existsSync(tmpPdf)) {
      throw new Error('لم يُنتج ملف PDF من التحويل');
    }
    const buf = fs.readFileSync(tmpPdf);
    try {
      fs.unlinkSync(tmpPdf);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpSrc);
    } catch {
      /* ignore */
    }
    return { buffer: buf, mime: 'application/pdf', converted: true };
  } catch (err: any) {
    // عند فشل التحويل قاعدةً (أوفيس غير مثبت)، نعيد الملف الأصلي ليتعامل معه المتصفح/البرامج
    return { buffer: plain, mime: mimeOf(name), converted: false };
  }
}

/** نسخ الملف كنسخة صريحة مؤقتة (لفتحه بالبرنامج الافتراضي للتحرير/الطباعة) مع فك التشفير */
export function exportModelToTemp(name: string): string {
  const p = safeModelPath(name);
  if (!fs.existsSync(p)) throw new Error(`الملف [${name}] غير موجود`);
  const raw = fs.readFileSync(p);
  const plain = decryptIfNeeded(name, raw);
  const ext = extOf(name);
  const tmp = path.join(os.tmpdir(), `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || 'bin'}`);
  fs.writeFileSync(tmp, plain);
  return tmp;
}

export const modelsService = {
  resolveModelsDir,
  listModels,
  readModelBuffer,
  writeModel,
  renameModel,
  deleteModel,
  mimeOf,
  safeModelPath,
  renderModel,
  exportModelToTemp,
  probeFirstEncrypted,
};