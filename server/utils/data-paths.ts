/**
 * ===== مؤشّر «مجلد البيانات» (Data Folders Indicator) =====
 *
 * مصدر الحقيقة الوحيد لمسارات بيانات الخادم الأربعة + مكتبة النماذج:
 *   1) بيانات PostgreSQL المضمّن        → `PG_DATA_DIR`     أو `cwd/pgdata`
 *   2) بيانات النقابة (CSV/استمارة 2)   → `UNION_DATA_DIR`  أو `cwd/server/data`
 *   3) كشوف المرتبات المستوردة (ملف)    → `cwd/data/payroll-imports.json`
 *   4) مستندات ETA المرسلة (ملف)        → `server/data/eta-documents.json`
 *   5) مكتبة النماذج والمستندات         → `UNION_MODELS_DIR` أو `cwd/نماذج`
 *
 * لماذا هذا الملف موجود؟ لأن كل خدمة كانت تحلّ مسارها بنفسها، فكان أي مؤشر يعرض
 * «مسار البيانات» مضطراً لإعادة كتابة المنطق — أي لعرض مسار قد لا يكون المسار الذي
 * يقرأ منه الخادم فعلاً. الآن **الخدمات نفسها تستورد الحلّ من هنا**، فالمؤشّر والخادم
 * يقرآن المجلدات نفسها بحرفية المنطق نفسه (`test/data-paths.test.ts` يحرس ذلك).
 *
 * قواعد الصدق (ملزمة — لا استثناءات):
 *   • لا مسار إلا كما يحلّه الخادم **فعلاً وقت الطلب** (لا تخزين، لا ثابت إقلاع).
 *   • لا حجم ولا عدد ملفات إلا **مقيس** من القرص؛ فإن تعذّر القياس ⇒ `UNAVAILABLE`
 *     مع إعلان السبب، ولا يُكتب صفر يوحي بأنه قياس.
 *   • لا «جاهز» (`READY`) إلا بعد **فحص كتابة حقيقي**: ملف مؤقّت يُنشأ ويُحذف
 *     داخل المجلد، أو إعادة كتابة البايت نفسه في الملف من دون تغيير محتواه.
 *   • المجلد الغائب يُعلن `MISSING` صراحةً، ولا يُنشأ أبداً من هنا (القراءة لا تكتب).
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { moduleDir, resolveFirst } from './runtime-paths.js';

// ---------------------------------------------------------------------------
// الأنواع المعلنة
// ---------------------------------------------------------------------------

/** أنواع المسارات التي يعرفها المؤشّر — كل نوع مقابل لمجلد/ملف يستخدمه الخادم فعلاً */
export type DataPathKind =
  | 'POSTGRES_DATA'
  | 'UNION_DATA'
  | 'PAYROLL_IMPORTS_FILE'
  | 'ETA_DOCUMENTS_FILE'
  | 'MODELS';

/**
 * حالة المسار:
 *  - `READY`        موجود + فحص كتابة حقيقي نجح
 *  - `MISSING`      غير موجود (لا يُزعم وجوده أبداً)
 *  - `NOT_WRITABLE` موجود لكن فحص الكتابة الحقيقي فشل (محمي/للقراءة فقط)
 *  - `UNAVAILABLE`  تعذّر الفحص أو القياس — يُعلن صراحةً بدل أي قيمة مُخمَّنة
 */
export type DataPathStatus = 'READY' | 'MISSING' | 'NOT_WRITABLE' | 'UNAVAILABLE';

/** من أين جاء المسار: متغير بيئة مضبوط، أم الافتراضي الذي يصل إليه الخادم */
export type DataPathSource = 'env' | 'default';

/** نتيجة حلّ مسار واحد (بلا فحص قرص) — تُستخدم من الخدمات ومن المؤشّر معاً */
export interface ResolvedDataPath {
  /** المسار الكامل المحلول */
  path: string;
  /** مصدر القيمة النهائية */
  source: DataPathSource;
  /** اسم متغير البيئة إن كانت القيمة منه */
  envVarName?: string;
  /** كل المرشّحات بالترتيب الذي يُجرَّب فعلاً (شفافية: لماذا هذا المسار؟) */
  candidates: Array<{ path: string; origin: string; exists: boolean }>;
}

/** حدود القياس الفعلية (تُعلن في النتيجة عند بلوغها — لا قياس ناقص صامت) */
export interface MeasurementLimits {
  /** أقصى عدد عُقد (ملفات/مجلدات) تُزار في المشي */
  maxEntries: number;
  /** أقصى عمق للمشي */
  maxDepth: number;
}

/** ما قيس فعلاً من القرص — وكل حقل `null` يعني «لم يُقَس» لا «صفر» */
export interface DataPathMeasurement {
  /** عدد الملفات المقروء من القرص (null = لم يُقَس) */
  fileCount: number | null;
  /** عدد المجلدات الفرعية المقروء من القرص (null = لم يُقَس) */
  dirCount: number | null;
  /** مجموع البايتات المقروء من القرص (null = لم يُقَس) */
  totalBytes: number | null;
  /** هل توقف المشي عند الحدّ المعلَن؟ (الرقم حينها جزئي — ويُقال ذلك صراحة) */
  truncated: boolean;
  /** سبب تعذّر القياس إن تعذّر */
  error?: string;
}

/** سطر واحد في المؤشّر */
export interface DataPathEntry {
  kind: DataPathKind;
  /** تسمية عربية ثابتة للنوع */
  label: string;
  /** هل المدخل مجلد أم ملف؟ (يحدّد ماذا يعني «عدد الملفات/الحجم») */
  isDirectory: boolean;
  /** المسار الكامل كما يحلّه الخادم وقت الطلب */
  path: string;
  source: DataPathSource;
  envVarName?: string;
  /** المرشّحات بالترتيب — تُعرض في الواجهة للتفسير، لا للتخمين */
  candidates: ResolvedDataPath['candidates'];
  /** الحالة المعلنة */
  status: DataPathStatus;
  exists: boolean;
  /** نتيجة فحص الكتابة الحقيقي على الهدف نفسه */
  writable: boolean;
  /** هل فُحصت الكتابة فعلياً (ملف مؤقّت للمجلد / بايت للملف)؟ */
  writeProbeRan: boolean;
  /** نتيجة فحص كتابة حقيقي على أقرب مجلد أبٍ موجود (للتشخيص عند الغياب) */
  parentWritable: boolean | null;
  /** أقرب مجلد أبٍ موجود فعلاً */
  nearestExistingParent: string | null;
  measurement: DataPathMeasurement;
  /** ملاحظات معلنة (لا تُخفى داخل المنطق) */
  notes: string[];
}

export interface DataPathsSummary {
  ready: number;
  missing: number;
  notWritable: number;
  unavailable: number;
}

export interface DataPathsSnapshot {
  /** وقت القياس — الأرقام لحظية لا مخزّنة */
  timestamp: string;
  /** مجلد التشغيل الذي بُنيت عليه المسارات الافتراضية */
  cwd: string;
  /** الحالة إن تعذّر الجمع نفسه */
  status: 'ok' | 'UNAVAILABLE';
  /** سبب تعذّر الجمع (إن حدث) */
  error?: string;
  limits: MeasurementLimits;
  paths: DataPathEntry[];
  summary: DataPathsSummary;
}

// ---------------------------------------------------------------------------
// ثوابت الأسماء (ملف واحد لكل اسم — لا تكرار في الخدمات)
// ---------------------------------------------------------------------------

export const PGDATA_DIR_NAME = 'pgdata';
export const UNION_DATA_RELATIVE = ['server', 'data'];
export const PAYROLL_IMPORTS_FILENAME = 'payroll-imports.json';
export const ETA_DOCUMENTS_FILENAME = 'eta-documents.json';
export const MODELS_DIR_NAME = 'نماذج';

// ---------------------------------------------------------------------------
// حلّ المسارات — **هذه الدوال هي ما تستخدمه الخدمات نفسها**
// ---------------------------------------------------------------------------

/** مجلد الوحدة المستدعية (تطوير ESM / حزمة CJS / Electron asar) */
export function callerModuleDir(importMetaUrl?: string): string {
  return moduleDir(importMetaUrl) || process.cwd();
}

/**
 * في تشغيل المصدر تكون هذه الوحدة في `server/utils` والوحدات الثلاث في
 * `server/services` (ETA في مجلد فرعي). في CJS المجمّع يشترك الجميع في `__dirname`؛
 * هذا الاستدلال يحافظ على الموضع الذي تستخدمه خدمة ETA فعلياً في الحزمة أيضاً.
 */
function defaultServiceModuleDir(kind: 'service' | 'eta'): string {
  const ownDir = callerModuleDir(import.meta.url);
  if (path.basename(ownDir) === 'utils' && path.basename(path.dirname(ownDir)) === 'server') {
    return kind === 'eta' ? path.resolve(ownDir, '..', 'services', 'eta') : path.resolve(ownDir, '..', 'services');
  }
  return ownDir;
}

/**
 * مجلد بيانات PostgreSQL المضمّن — نفس سطر `pg-embedded.ts` حرفياً:
 * `process.env.PG_DATA_DIR || path.join(process.cwd(), 'pgdata')`.
 */
export function resolvePgDataDir(): ResolvedDataPath {
  // Same truthiness as pg-embedded.ts (`env || fallback`); relative values resolve against cwd.
  const envValue = process.env.PG_DATA_DIR;
  const fallback = path.join(process.cwd(), PGDATA_DIR_NAME);
  if (envValue) {
    const resolved = path.resolve(envValue);
    return {
      path: resolved,
      source: 'env',
      envVarName: 'PG_DATA_DIR',
      candidates: [{ path: resolved, origin: 'PG_DATA_DIR', exists: existsSafe(resolved) }],
    };
  }
  return {
    path: fallback,
    source: 'default',
    candidates: [{ path: fallback, origin: 'الافتراضي: cwd/pgdata', exists: existsSafe(fallback) }],
  };
}

/**
 * مجلد بيانات النقابة (ملفات CSV الحقيقية + استمارة 2 تأمينات) — نفس سلسلة
 * المرشّحات التي كانت داخل `csv-import.service.ts` و`employee-affairs.service.ts`:
 * `UNION_DATA_DIR` ثم `cwd/server/data` ثم مسارات نسبية لمجلد الوحدة (تطوير/حزمة/Electron).
 *
 * @param moduleDirOfCaller مجلد الوحدة المستدعية (يُمرَّر صراحةً ليبقى الحلّ مطابقاً
 *        لما كان داخل الخدمة — `data-paths` لا يفترض موقع نفسه مكان المستدعي).
 * @param allowFileTarget الخدمات القديمة كانت تقبل أول مرشّح **موجود** حتى لو كان ملفاً
 *        (ثم تأخذ مجلده الأب)؛ هذه السلسلة تحافظ على ذلك السلوك حرفياً.
 */
export function resolveUnionDataDir(
  moduleDirOfCaller?: string,
  options?: { allowFileTarget?: boolean }
): ResolvedDataPath {
  const moduleDirValue = moduleDirOfCaller || defaultServiceModuleDir('service');
  const allowFileTarget = options?.allowFileTarget !== false; // الافتراضي: سلوك الخدمات الحالي
  const rawCandidates: Array<{ path: string; origin: string }> = [
    { path: String(process.env.UNION_DATA_DIR || ''), origin: 'UNION_DATA_DIR' },
    { path: path.join(process.cwd(), ...UNION_DATA_RELATIVE), origin: 'الافتراضي: cwd/server/data' },
    { path: path.join(moduleDirValue, '..', 'data'), origin: 'تطوير: server/services/../data' },
    { path: path.join(moduleDirValue, ...UNION_DATA_RELATIVE), origin: 'حزمة: بجوار مجلد الوحدة server/data' },
    { path: path.join(moduleDirValue, '..', ...UNION_DATA_RELATIVE), origin: 'Electron asar: app.asar/server/data' },
    { path: path.join(moduleDirValue, '..', '..', ...UNION_DATA_RELATIVE), origin: 'احتياطي: مجلدان فوق الوحدة' },
  ];
  // Relative candidates resolve against cwd, matching the services while returning full paths.
  const candidates = rawCandidates.map((candidate) => ({
    ...candidate,
    path: candidate.path ? path.resolve(candidate.path) : '',
  }));

  const listed = candidates.map((candidate) => ({
    path: candidate.path,
    origin: candidate.origin,
    exists: candidate.path ? existsSafe(candidate.path, allowFileTarget) : false,
  }));

  // أول مرشّح موجود فعلاً (أو أول مرشّح بيئة إن لم يوجد شيء — نفس `|| cwd/server/data`)
  const firstExisting = allowFileTarget
    ? resolveFirst(candidates.map((candidate) => candidate.path || null))
    : resolveFirst(
        candidates
          .map((candidate) => candidate.path || null)
          .filter((candidate) => (candidate ? isDirectorySafe(candidate) : false))
      );

  if (firstExisting) {
    const matched = candidates.find((candidate) => candidate.path === firstExisting);
    const fromEnv = matched?.origin === 'UNION_DATA_DIR';
    return {
      path: firstExisting,
      source: fromEnv ? 'env' : 'default',
      envVarName: fromEnv ? 'UNION_DATA_DIR' : undefined,
      candidates: listed,
    };
  }

  const fallback = path.join(process.cwd(), ...UNION_DATA_RELATIVE);
  return { path: fallback, source: 'default', candidates: listed };
}

/**
 * ملف كشوف المرتبات المستوردة — نفس سطر `payroll-import.service.ts` حرفياً:
 * `path.join(process.cwd(), 'data', 'payroll-imports.json')` (بلا متغير بيئة حتى الآن).
 */
export function resolvePayrollImportsFile(): ResolvedDataPath {
  const file = path.join(process.cwd(), 'data', PAYROLL_IMPORTS_FILENAME);
  return {
    path: file,
    source: 'default',
    candidates: [{ path: file, origin: 'الافتراضي: cwd/data/payroll-imports.json', exists: existsSafe(file) }],
  };
}

/**
 * مجلد مستندات ETA — نفس سطر `eta-store.ts` حرفياً:
 * `path.resolve(moduleDir(import.meta.url), '../../data')` أي `server/data` في التطوير.
 */
export function resolveEtaDataDir(moduleDirOfEtaStore?: string): ResolvedDataPath {
  const moduleDirValue = moduleDirOfEtaStore || defaultServiceModuleDir('eta');
  const dir = path.resolve(moduleDirValue, '..', '..', 'data');
  return {
    path: dir,
    source: 'default',
    candidates: [{ path: dir, origin: 'الافتراضي: server/data (نسبي لموضع eta-store)', exists: existsSafe(dir) }],
  };
}

/** ملف سجل مستندات ETA (داخل مجلد ETA المحلول) */
export function resolveEtaDocumentsFile(moduleDirOfEtaStore?: string): ResolvedDataPath {
  const dir = resolveEtaDataDir(moduleDirOfEtaStore);
  const file = path.join(dir.path, ETA_DOCUMENTS_FILENAME);
  return {
    path: file,
    source: dir.source,
    envVarName: dir.envVarName,
    candidates: [
      ...dir.candidates,
      { path: file, origin: 'اسم الملف الثابت: eta-documents.json', exists: existsSafe(file) },
    ],
  };
}

/**
 * مجلد مكتبة النماذج — نفس سلسلة `models.service.ts` **بلا إنشاء** (المؤشّر لا يكتب):
 * `UNION_MODELS_DIR` ثم `cwd/نماذج` ثم `resourcesPath/نماذج` (Electron) ثم نسبي للوحدة.
 */
export function resolveModelsDir(moduleDirOfCaller?: string): ResolvedDataPath {
  const moduleDirValue = moduleDirOfCaller || defaultServiceModuleDir('service');
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  const rawCandidates: Array<{ path: string; origin: string }> = [
    { path: String(process.env.UNION_MODELS_DIR || ''), origin: 'UNION_MODELS_DIR' },
    { path: path.join(process.cwd(), MODELS_DIR_NAME), origin: 'الافتراضي: cwd/نماذج' },
    { path: resourcesPath ? path.join(resourcesPath, MODELS_DIR_NAME) : '', origin: 'Electron: resourcesPath/نماذج' },
    { path: path.join(moduleDirValue, '..', '..', MODELS_DIR_NAME), origin: 'نسبي لمجلد الوحدة' },
  ];
  const candidates = rawCandidates.map((candidate) => ({
    ...candidate,
    path: candidate.path ? path.resolve(candidate.path) : '',
  }));

  const listed = candidates.map((candidate) => ({
    path: candidate.path,
    origin: candidate.origin,
    exists: candidate.path ? existsSafe(candidate.path) : false,
  }));

  const firstExisting = resolveFirst(candidates.map((candidate) => candidate.path || null));
  if (firstExisting) {
    const matched = candidates.find((candidate) => candidate.path === firstExisting);
    const fromEnv = matched?.origin === 'UNION_MODELS_DIR';
    return {
      path: firstExisting,
      source: fromEnv ? 'env' : 'default',
      envVarName: fromEnv ? 'UNION_MODELS_DIR' : undefined,
      candidates: listed,
    };
  }

  // لا شيء موجود: نعلن المسار الذي ستنشئه الخدمة عند أول كتابة (ونحن لا ننشئه)
  const fallback = path.join(process.cwd(), MODELS_DIR_NAME);
  return { path: fallback, source: 'default', candidates: listed };
}

// ---------------------------------------------------------------------------
// الفحص الحقيقي: وجود / كتابة / قياس
// ---------------------------------------------------------------------------

function existsSafe(target: string, allowFile = true): boolean {
  try {
    if (!target) return false;
    return allowFile ? fs.existsSync(target) : isDirectorySafe(target);
  } catch {
    return false;
  }
}

function isDirectorySafe(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * فحص كتابة **حقيقي**: محاولة إنشاء ملف مؤقّت داخل المجلد ثم حذفه.
 * لا يُعتمد `fs.access(W_OK)` وحده: في حاويات/أقراص شبكة قد يكذب، والمطلوب
 * أن «جاهز» تعني «كتبتُ فعلاً هنا قبل لحظات».
 */
export function realWriteProbe(dir: string): { writable: boolean; ran: boolean; reason?: string } {
  const probeFile = path.join(dir, `.union-write-probe-${process.pid}-${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = fs.openSync(probeFile, 'wx');
    fs.writeSync(fd, 'probe');
    fs.closeSync(fd);
    fd = null;
    fs.unlinkSync(probeFile);
    return { writable: true, ran: true };
  } catch (error: any) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* تجاهل */ }
    }
    try { fs.unlinkSync(probeFile); } catch { /* تجاهل */ }
    return { writable: false, ran: true, reason: error?.message || String(error) };
  }
}

/** اختبار كتابة غير هدّام لملف موجود: يكتب البايت الأول نفسه ثم يزامنه إلى القرص. */
function realFileWriteProbe(file: string): { writable: boolean; ran: boolean; reason?: string } {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r+');
    const stat = fs.fstatSync(fd);
    if (stat.size > 0) {
      const firstByte = Buffer.alloc(1);
      const read = fs.readSync(fd, firstByte, 0, 1, 0);
      if (read !== 1) throw new Error('تعذّر قراءة البايت الأول لاختبار كتابة غير هدّام');
      fs.writeSync(fd, firstByte, 0, 1, 0);
    } else {
      // يبقى الملف فارغاً: open(r+) يثبت إمكان فتح الهدف للكتابة، والكتابة صفرية الطول
      // لا تغيّر محتواه ولا حجمه.
      fs.writeSync(fd, Buffer.alloc(0), 0, 0, 0);
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return { writable: true, ran: true };
  } catch (error: any) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* تجاهل */ }
    }
    return { writable: false, ran: true, reason: error?.message || String(error) };
  }
}

/** أقرب مجلد أبٍ موجود فعلاً + فحص كتابة حقيقي عليه (للتشخيص عند غياب الهدف) */
export function nearestExistingParentProbe(target: string): {
  parent: string | null;
  writable: boolean | null;
  reason?: string;
} {
  let current = path.dirname(path.resolve(target));
  let guard = 0;
  while (guard++ < 32) {
    if (isDirectorySafe(current)) {
      const probe = realWriteProbe(current);
      return { parent: current, writable: probe.writable, reason: probe.reason };
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return { parent: null, writable: null };
}

/** حدود المشي الافتراضية — تُعلن في الاستجابة، ويُرسم «القياس جزئي» عند بلوغها */
export const DEFAULT_MEASUREMENT_LIMITS: MeasurementLimits = { maxEntries: 200_000, maxDepth: 24 };

/**
 * قياس **فعلي** لمجلد: عدد الملفات/المجلدات ومجموع البايتات بمشي حقيقي.
 * أي خطأ في القراءة العليا ⇒ `error` (فتُعلن الحالة `UNAVAILABLE`)؛ وأخطاء العُقد
 * الفردية تُجمع وتُعلن كملاحظة بدل إسقاطها صامتاً.
 */
export function measureDirectory(dir: string, limits: MeasurementLimits = DEFAULT_MEASUREMENT_LIMITS): DataPathMeasurement {
  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;
  let visited = 0;
  let truncated = false;
  const nodeErrors: string[] = [];

  const walk = (current: string, depth: number): void => {
    if (truncated || depth > limits.maxDepth) {
      if (depth > limits.maxDepth) truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error: any) {
      // تعذّر القراءة هنا ⇒ لا يوجد قياس صادق لهذا المجلد
      throw Object.assign(new Error(error?.message || String(error)), { code: error?.code });
    }
    for (const entry of entries) {
      if (visited >= limits.maxEntries) {
        truncated = true;
        return;
      }
      visited += 1;
      const full = path.join(current, entry.name);
      try {
        if (entry.isSymbolicLink()) {
          // لا نتبع الروابط: قد تخرج عن المجلد وتُضاعف الحساب
          nodeErrors.push(`رابط رمزي لم يُتبَع: ${full}`);
          continue;
        }
        if (entry.isDirectory()) {
          dirCount += 1;
          walk(full, depth + 1);
          continue;
        }
        if (entry.isFile()) {
          fileCount += 1;
          totalBytes += Number(fs.statSync(full, { bigint: true }).size);
        }
      } catch (error: any) {
        nodeErrors.push(`${full}: ${error?.message || error}`);
      }
    }
  };

  try {
    walk(dir, 1);
  } catch (error: any) {
    return {
      fileCount: null,
      dirCount: null,
      totalBytes: null,
      truncated,
      error: error?.message || String(error),
    };
  }

  const measurement: DataPathMeasurement = { fileCount, dirCount, totalBytes, truncated };
  if (nodeErrors.length > 0) {
    measurement.error = `تعذّر فحص ${nodeErrors.length} عُقدة — أولها: ${nodeErrors[0]}`;
  }
  return measurement;
}

/** قياس ملف واحد: حجمه الحقيقي بالبايت (لا تقدير) */
export function measureFile(file: string): DataPathMeasurement {
  try {
    const stat = fs.statSync(file, { bigint: true });
    return { fileCount: 1, dirCount: 0, totalBytes: Number(stat.size), truncated: false };
  } catch (error: any) {
    return {
      fileCount: null,
      dirCount: null,
      totalBytes: null,
      truncated: false,
      error: error?.message || String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// الدالة الواحدة: حلّ + فحص + قياس لكل المسارات
// ---------------------------------------------------------------------------

export interface CollectDataPathsOptions {
  /**
   * مجلدات الوحدات المستدعية — تُمرَّر من الخدمات نفسها (عبر `import.meta.url`)
   * حتى يبقى الحلّ مطابقاً لمنطق كل خدمة في أوضاع التطوير/الحزمة/Electron.
   */
  moduleDirs?: {
    unionData?: string;
    eta?: string;
    models?: string;
  };
  limits?: MeasurementLimits;
}

const KIND_LABELS: Record<DataPathKind, string> = {
  POSTGRES_DATA: 'بيانات PostgreSQL المضمّن',
  UNION_DATA: 'بيانات النقابة (CSV واستمارة 2)',
  PAYROLL_IMPORTS_FILE: 'كشوف المرتبات المستوردة (ملف)',
  ETA_DOCUMENTS_FILE: 'سجل مستندات ETA (ملف)',
  MODELS: 'مكتبة النماذج والمستندات',
};

function buildEntry(
  kind: DataPathKind,
  resolved: ResolvedDataPath,
  isDirectory: boolean,
  limits: MeasurementLimits
): DataPathEntry {
  const notes: string[] = [];
  const target = resolved.path;

  let exists = false;
  let isDirNow = false;
  let statError: string | undefined;
  try {
    const stat = fs.statSync(target);
    exists = true;
    isDirNow = stat.isDirectory();
  } catch (error: any) {
    if (error?.code !== 'ENOENT') statError = error?.message || String(error);
  }

  const typeMismatch = exists && ((isDirectory && !isDirNow) || (!isDirectory && isDirNow));
  if (exists && isDirectory && !isDirNow) {
    notes.push('المسار موجود لكنه ملف لا مجلد — الخادم يتوقع مجلداً هنا');
  }
  if (exists && !isDirectory && isDirNow) {
    notes.push('المسار موجود لكنه مجلد لا ملف — الخادم يتوقع ملفاً هنا');
  }

  // فحص كتابة حقيقي على الهدف نفسه: إنشاء وحذف مؤقّت داخل المجلد، أو كتابة
  // البايت الموجود نفسه (من دون تغيير المحتوى) داخل ملف البيانات.
  const probe = exists
    ? (isDirNow ? realWriteProbe(target) : realFileWriteProbe(target))
    : { writable: false, ran: false };
  if (!exists) {
    notes.push('الهدف غير موجود — لم يُجرَ فحص كتابة عليه (لا يُزعم «جاهز» بلا هدف)');
  } else if (!probe.writable && probe.reason) {
    notes.push(`فشل فحص الكتابة الحقيقي: ${probe.reason}`);
  }

  // عند الغياب: تشخيص صادق بأقرب مجلد أبٍ موجود (هل يمكن إنشاء الهدف أصلاً؟)
  let nearestExistingParent: string | null = null;
  let parentWritable: boolean | null = null;
  if (!exists) {
    const parentProbe = nearestExistingParentProbe(target);
    nearestExistingParent = parentProbe.parent;
    parentWritable = parentProbe.writable;
    if (parentProbe.parent) {
      notes.push(
        parentProbe.writable
          ? `أقرب مجلد أبٍ موجود وقابل للكتابة: ${parentProbe.parent} (يمكن للخادم إنشاء الهدف عند أول كتابة)`
          : `أقرب مجلد أبٍ موجود غير قابل للكتابة: ${parentProbe.parent}`
      );
    }
  }

  // القياس الفعلي
  let measurement: DataPathMeasurement;
  if (!exists && statError) {
    measurement = { fileCount: null, dirCount: null, totalBytes: null, truncated: false, error: statError };
  } else if (!exists) {
    measurement = { fileCount: null, dirCount: null, totalBytes: null, truncated: false };
    notes.push('لا عدد ملفات ولا حجم: لا شيء موجود ليُقاس (ليست أصفاراً مقاسة)');
  } else if (isDirNow) {
    measurement = measureDirectory(target, limits);
    if (measurement.truncated) {
      notes.push(`القياس جزئي: بلغ حدّ المشي (${limits.maxEntries} عقدة / عمق ${limits.maxDepth})`);
    }
  } else {
    measurement = measureFile(target);
  }
  if (statError) notes.push(`تعذّر قراءة بيانات المسار: ${statError}`);

  // الحالة المعلنة — التعذّر أولاً، ثم الغياب، ثم الكتابة، ثم الجاهزية.
  // ENOENT فقط يعني «غائب»؛ EACCES/EIO وغيرها تعذّر فحصها ويجب إعلان UNAVAILABLE.
  let status: DataPathStatus;
  if (statError) status = 'UNAVAILABLE';
  else if (!exists) status = 'MISSING';
  else if (typeMismatch || measurement.error) status = 'UNAVAILABLE';
  else if (!probe.writable) status = 'NOT_WRITABLE';
  else status = 'READY';

  if (status === 'UNAVAILABLE') {
    const reason = statError || measurement.error || (typeMismatch ? 'نوع المسار لا يطابق ما يتوقعه الخادم' : 'تعذّر الفحص');
    notes.push(`تعذّر الفحص ⇒ الحالة UNAVAILABLE صراحةً: ${reason}`);
  }
  if (measurement.error && status !== 'UNAVAILABLE') {
    notes.push(`القياس ناقص: ${measurement.error}`);
  }

  return {
    kind,
    label: KIND_LABELS[kind],
    isDirectory,
    path: target,
    source: resolved.source,
    envVarName: resolved.envVarName,
    candidates: resolved.candidates,
    status,
    exists,
    writable: probe.writable,
    writeProbeRan: probe.ran,
    parentWritable,
    nearestExistingParent,
    measurement,
    notes,
  };
}

/**
 * **الدالة الواحدة** للمؤشّر: تحلّ المسارات بمنطق الخادم نفسه وقت الطلب، وتفحص
 * الكتابة فحصاً حقيقياً، وتقيس العدد/الحجم من القرص، وتُعلن التعذّر صراحةً.
 *
 * لا تخزين مؤقت: كل نداء يقيس من جديد (الأرقام المعروضة هي لحظة الطلب نفسها).
 */
export function collectDataPaths(options: CollectDataPathsOptions = {}): DataPathsSnapshot {
  const limits = { ...DEFAULT_MEASUREMENT_LIMITS, ...(options.limits || {}) };
  const started = new Date();
  try {
    const moduleDirs = options.moduleDirs || {};
    const entries: DataPathEntry[] = [
      buildEntry('POSTGRES_DATA', resolvePgDataDir(), true, limits),
      buildEntry('UNION_DATA', resolveUnionDataDir(moduleDirs.unionData), true, limits),
      buildEntry('PAYROLL_IMPORTS_FILE', resolvePayrollImportsFile(), false, limits),
      buildEntry('ETA_DOCUMENTS_FILE', resolveEtaDocumentsFile(moduleDirs.eta), false, limits),
      buildEntry('MODELS', resolveModelsDir(moduleDirs.models), true, limits),
    ];

    return {
      timestamp: started.toISOString(),
      cwd: process.cwd(),
      status: 'ok',
      limits,
      paths: entries,
      summary: summarize(entries),
    };
  } catch (error: any) {
    // التعذّر الكلي يُعلن UNAVAILABLE — لا قائمة فارغة توحي بأن كل شيء سليم
    return {
      timestamp: started.toISOString(),
      cwd: safeCwd(),
      status: 'UNAVAILABLE',
      error: error?.message || String(error),
      limits,
      paths: [],
      summary: { ready: 0, missing: 0, notWritable: 0, unavailable: 1 },
    };
  }
}

function safeCwd(): string {
  try {
    return process.cwd();
  } catch {
    return 'UNAVAILABLE';
  }
}

function summarize(entries: DataPathEntry[]): DataPathsSummary {
  const summary: DataPathsSummary = { ready: 0, missing: 0, notWritable: 0, unavailable: 0 };
  for (const entry of entries) {
    if (entry.status === 'READY') summary.ready += 1;
    else if (entry.status === 'MISSING') summary.missing += 1;
    else if (entry.status === 'NOT_WRITABLE') summary.notWritable += 1;
    else summary.unavailable += 1;
  }
  return summary;
}

/** تنسيق بايتات مقاسة لعرضها في الواجهة (بلا أرقام مختلقة) */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} بايت`;
  const units = ['كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}
