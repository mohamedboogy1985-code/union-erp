/**
 * ===== سلسلة تجزئة سجل التدقيق (Audit Log Hash Chain) — البند P0-3 =====
 * المرجع: docs/AI_AGENT_AUDIT.md
 *
 * سجل التدقيق كان ذاكرياً بالكامل: `persistAuditLog` موصول بمسارين فقط، وجدول
 * `audit_logs` بلا أعمدة `previous_hash/event_hash` — أي أن السجل يضيع مع كل
 * إعادة تشغيل، ولا يمكن إثبات عدم التلاعب أمام مراجع خارجي.
 *
 * هذه الوحدة هي نواة السلسلة المشتركة بين:
 *   - سجل الذاكرة (`store.recordAudit` يبني كل حدث فوق تجزئة الحدث السابق)،
 *   - السجل الدائم (`postgresSync.persistAuditLog` يكتب التسلسل والتجزئة في القاعدة)،
 *   - التحقق في أي اتجاه (ذاكرة أو قاعدة بيانات).
 *
 * التجزئة: sha256(`timestamp:userId:action:entityId:previousHash`) — أي تغيير في
 * أي حقل من حقول الحدث، أو حذف حدث، أو إعادة ترتيبه، يكسر السلسلة ويُكتشف.
 */
import { calculateAuditHash, sha256 } from '../utils/crypto.js';
import type { AuditLog } from '../../src/types/erp.js';

/**
 * إصدار تجزئة سجل التدقيق. النسخة الأولى (`calculateAuditHash`) كانت تُجزّئ
 * `timestamp:userId:action:entityId:previousHash` فقط، أي أن تعديل **نص التفاصيل**
 * (ماذا حدث فعلاً) أو `entityType` أو الحالة كان يمرّ بلا كسر للسلسلة — ثغرة
 * حقيقية في سجل تدقيق يُفترض أنه يثبت ما حدث. النسخة `a2` تُدخل كل حقول الحدث
 * في المضمون، وتُوسَم التجزئة بالبادئة حتى يظل التمييز ممكناً بين ترميز قديم
 * وتجزئة مُتلاعب بها.
 */
export const AUDIT_HASH_VERSION = 'a2';
const AUDIT_HASH_PREFIX = `${AUDIT_HASH_VERSION}:`;

/** تجزئة البداية: 64 صفراً (لا حدث سابق) */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

export interface AuditChainVerificationResult {
  source: 'memory' | 'database';
  totalEvents: number;
  verifiedCount: number;
  brokenCount: number;
  /** تجزئات بترميز قديم (`v1`) — غير قابلة للتحقق، تُرقّى بإعادة ختم مسجَّلة */
  legacyFormatCount: number;
  hashVersion: string;
  firstBrokenAt?: { id: string; sequence?: number | null; expected: string; stored: string };
  valid: boolean;
  checkedAt: string;
}

export function isVersionedAuditHash(hash?: string | null): boolean {
  return typeof hash === 'string' && hash.startsWith(AUDIT_HASH_PREFIX);
}

/** JSON حتمي (مفاتيح مرتّبة) حتى لا يغيّر ترتيب المفاتيح التجزئة */
function canonicalJson(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${k}:${canonicalJson(value[k])}`).join(',')}}`;
}

/**
 * تجزئة الحدث بمضمون كامل: هوية الحدث + مضمونه + الحالة + الارتباط + تجزئة السابق.
 * أي تعديل على التفاصيل أو النوع أو الحالة يكسر السلسلة.
 */
export function hashAuditLog(
  log: Pick<
    AuditLog,
    | 'timestamp'
    | 'userId'
    | 'action'
    | 'entityType'
    | 'entityId'
    | 'details'
    | 'status'
    | 'correlationId'
    | 'previousState'
    | 'newState'
  >,
  previousHash: string
): string {
  const payload = [
    String(log.timestamp ?? ''),
    String(log.userId ?? ''),
    String(log.action ?? ''),
    String(log.entityType ?? ''),
    String(log.entityId ?? ''),
    String(log.details ?? ''),
    String(log.status ?? ''),
    String(log.correlationId ?? ''),
    canonicalJson(log.previousState),
    canonicalJson(log.newState),
    previousHash,
  ].join('::');
  return `${AUDIT_HASH_PREFIX}${sha256(payload)}`;
}

/**
 * إعادة ختم سلسلة سجل التدقيق بالكامل (تُستخدم عند ترقية ترميز التجزئة فقط).
 * تُعيد عدد الصفوف التي تغيّرت تجزئتها.
 */
export function resealAuditLogChain(
  logs: (Pick<AuditLog, 'id' | 'timestamp'> & Partial<AuditLog>)[]
): { changed: number; tip: string } {
  const sorted = [...logs].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  let previous = AUDIT_GENESIS_HASH;
  let changed = 0;
  for (const log of sorted) {
    const hash = hashAuditLog(log as any, previous);
    if ((log as any).previousHash !== previous || (log as any).eventHash !== hash) changed += 1;
    (log as any).previousHash = previous;
    (log as any).eventHash = hash;
    previous = hash;
  }
  return { changed, tip: previous };
}

/**
 * التحقق من سلسلة أحداث التدقيق حسب ترتيبها الزمني/التسلسلي.
 * تُرتب الأحداث تصاعدياً بـ`sequence` عند توفره، وإلا بترتيب زمني تصاعدي.
 */
export function verifyAuditLogChain(
  logs: (Pick<AuditLog, 'id' | 'timestamp' | 'userId' | 'action' | 'entityId' | 'previousHash' | 'eventHash'> & {
    sequence?: number | null;
  })[],
  source: 'memory' | 'database' = 'memory'
): AuditChainVerificationResult {
  const sorted = [...logs].sort((a, b) => {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return String(a.timestamp).localeCompare(String(b.timestamp));
  });

  let expectedPrevious = AUDIT_GENESIS_HASH;
  let verifiedCount = 0;
  let brokenCount = 0;
  let legacyFormatCount = 0;
  let firstBrokenAt: AuditChainVerificationResult['firstBrokenAt'];

  for (const log of sorted) {
    const expectedHash = hashAuditLog(log as any, expectedPrevious);
    const versioned = isVersionedAuditHash(log.eventHash);
    const linksOk = log.previousHash === expectedPrevious;
    const hashOk = versioned && log.eventHash === expectedHash;

    if (!versioned && log.eventHash) {
      // ترميز قديم (v1): غير قابل للتحقق بهذا الإصدار ⇒ يُرقّى بإعادة ختم مسجَّلة
      legacyFormatCount += 1;
      expectedPrevious = String(log.eventHash);
      continue;
    }

    if (linksOk && hashOk) {
      verifiedCount += 1;
    } else {
      brokenCount += 1;
      if (!firstBrokenAt) {
        firstBrokenAt = {
          id: log.id,
          sequence: log.sequence ?? null,
          expected: expectedHash,
          stored: String(log.eventHash),
        };
      }
    }
    // حتى الحدث المكسور يُعتمد كطرف للسلسلة التالية، ليُكتشف الانكسار مرة واحدة لا آلاف المرات
    expectedPrevious = String(log.eventHash || expectedHash);
  }

  return {
    source,
    totalEvents: sorted.length,
    verifiedCount,
    brokenCount,
    legacyFormatCount,
    hashVersion: AUDIT_HASH_VERSION,
    firstBrokenAt,
    valid: brokenCount === 0 && legacyFormatCount === 0 && sorted.length > 0,
    checkedAt: new Date().toISOString(),
  };
}
