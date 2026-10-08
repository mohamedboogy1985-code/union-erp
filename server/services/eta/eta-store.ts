import fs from 'fs';
import path from 'path';
import { moduleDir } from '../../utils/runtime-paths.js';

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

const DATA_DIR = path.resolve(moduleDir(import.meta.url), '../../data');
const FILE = path.join(DATA_DIR, 'eta-documents.json');

function readAll(): Record<string, EtaDocumentRecord> {
  try {
    if (fs.existsSync(FILE)) {
      return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    }
  } catch {
    /* تجاهل تلف الملف */
  }
  return {};
}

function writeAll(map: Record<string, EtaDocumentRecord>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf-8');
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
