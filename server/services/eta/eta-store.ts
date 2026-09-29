import fs from 'fs';
import { callerModuleDir, resolveEtaDataDir, resolveEtaDocumentsFile } from '../../utils/data-paths.js';

/**
 * ===== تخزين محلي لمستندات ETA المُرسَلة/المهنّأة =====
 * سجل دائم (ملف JSON) يحفظ uuid ومعرّفات الإرسال والحالات حتى لا تضيع
 * الفواتير المرسلة عند إعادة التشغيل، ويُستخدم لربط نتائج البوابة بالمصدر
 * الداخلي (الإيصال/القيد).
 */

export interface EtaDocumentRecord {
  uuid: string;
  internalId?: string;
  source?: string;
  docType: string;
  docNumber: string;
  receiverName: string;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  submissionId?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VALID' | 'INVALID' | 'REJECTED' | 'CANCELLED' | 'PENDING';
  etaStatusCode?: string;
  etaValidationErrors?: string[];
  simulated: boolean;
  createdBy: string;
  createdAt: string;
  responseRaw?: Record<string, any>;
}

/** مجلد الوحدة وقت الإقلاع — يُمرَّر للحلّ المشترك ليبقى مطابقاً لمنطق ETA الأصلي */
export const ETA_MODULE_DIR = callerModuleDir(import.meta.url);

/**
 * مجلد سجل ETA وملفه — يُحلّان من `server/utils/data-paths.ts` (نفس الدالة التي
 * يعرضها مؤشّر «مجلد البيانات»)، ويُعاد حلّهما **عند كل نداء** لا وقت الإقلاع،
 * فالمؤشّر والخادم يقرآن المسار نفسه في اللحظة نفسها.
 */
export function etaDataDir(): string {
  return resolveEtaDataDir(ETA_MODULE_DIR).path;
}

export function etaDocumentsFile(): string {
  return resolveEtaDocumentsFile(ETA_MODULE_DIR).path;
}

function readAll(): Record<string, EtaDocumentRecord> {
  const file = etaDocumentsFile();
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch {
    /* تجاهل تلف الملف */
  }
  return {};
}

function writeAll(map: Record<string, EtaDocumentRecord>): void {
  const dir = etaDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(etaDocumentsFile(), JSON.stringify(map, null, 2), 'utf-8');
}

export const etaStore = {
  list(): EtaDocumentRecord[] {
    return Object.values(readAll()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  },
  get(uuid: string): EtaDocumentRecord | undefined {
    return readAll()[uuid];
  },
  save(record: EtaDocumentRecord): void {
    const all = readAll();
    all[record.uuid] = record;
    writeAll(all);
  },
  update(uuid: string, patch: Partial<EtaDocumentRecord>): EtaDocumentRecord | undefined {
    const all = readAll();
    const cur = all[uuid];
    if (!cur) return undefined;
    all[uuid] = { ...cur, ...patch, uuid: cur.uuid };
    writeAll(all);
    return all[uuid];
  },
};
