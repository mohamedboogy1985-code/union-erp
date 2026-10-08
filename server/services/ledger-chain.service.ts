/**
 * ===== سلسلة التجزئة المضادة للتلاعب (Blockchain-style Ledger Chain) =====
 * يعتمد على ربط كل قيد يومية بتجزئة SHA-256 لمضمونه وتجزئة القيد السابق،
 * بحيث أي تعديل لاحق يكسر السلسلة ويُكتشف فوراً عند الفحص.
 *
 * ملاحظة: هذه الوحدة لا تستورد الكائن العام لتفادي اعتماد دائري (circular
 * dependency) مع `store.ts`؛ بل تستقبل قائمة القيود المطلوب معالجتها.
 */
import { JournalEntry, LedgerChainVerificationResult } from '../../src/types/erp.js';
import { sha256 } from '../utils/crypto.js';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * إصدار ترميز التجزئة. يُوسَّم كل ختم جديد به، لأن مضمون التجزئة يجب أن يكون
 * **قابلاً للمقارنة عبر مسارات التحميل المختلفة**:
 *  - المسار الأول: البذر من الذاكرة (أرقام JS: 500).
 *  - المسار الثاني: التحميل من PostgreSQL (numeric يعود نصاً: '500.00').
 * بدون تطبيع صريح كان إقلاع واحد يجعل كل القيود تبدو «متلاعباً بها» لمجرد اختلاف
 * تمثيل الرقم أو ترتيب الأسطر — وهذا ما جعل السلسلة تُقرأ مكسورة بعد إعادة التشغيل.
 * الوسم يجعل التمييز ممكناً: تجزئة بلا وسم = ترميز قديم ⇒ تُرقّى بإعادة ختم مسجَّلة،
 * لا تُخفى كأنها تلاعب ولا يُغفر لها كأنها سليمة.
 *
 * v3: أُخرج رقم السطر من مضمون التجزئة (وصار ترتيب الأسطر محتوىً لا موضعاً). السبب
 * مقيس: القاعدة لا تخزّن رقم السطر، وعند التحميل تُعاد ترقيم الأسطر بترتيب المعرّفات
 * — و«jei-…-c2» يسبق «jei-…-d1» أبجدياً — فينقلب ترتيب المدين/الدائن ويُحسب الطرف
 * الأول دائناً، فيُقرأ **كل** قيد متلاعباً به بعد كل إعادة تشغيل. المضمون الآن هو
 * مجموعة أسطر القيد (معرّف/حساب/مدين/دائن/وصف) لا مواضعها، فالسلسلة تصمد أمام دورة
 * (ذاكرة ← قاعدة ← ذاكرة)، ويبقى أي تغيير في مبلغ أو حساب أو وصف مكشوفاً.
 */
export const LEDGER_HASH_VERSION = 'v3';
const HASH_PREFIX = `${LEDGER_HASH_VERSION}:`;

export function isVersionedLedgerHash(hash?: string | null): boolean {
  return typeof hash === 'string' && hash.startsWith(HASH_PREFIX);
}

/** تطبيع المبالغ: '500.00' و500 و500.004 → '500.00' (تمثيل حتمي واحد) */
function canonMoney(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

/** تطبيع التاريخ: Date أو ISO أو 'YYYY-MM-DD' → 'YYYY-MM-DD' */
function canonDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function canonText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * أسطر القيد بمضمون حتمي **مستقل عن الترتيب ورقم السطر**:
 * كل سطر يُرمَّز بمضمونه ثم تُرتَّب الأسطر المرمَّزة نفسها وتُوصل. هذا يجعل التجزئة
 * قابلة للمقارنة بين الذاكرة وبعد التحميل من القاعدة (حيث يُعاد ترقيم الأسطر)،
 * ويبقي أي تغيير في الحساب أو المبلغ أو الوصف كاسراً للتجزئة.
 */
function canonicalLines(entry: JournalEntry): string {
  return (entry.lines || [])
    .map(
      (l) =>
        `L:${canonText(l.id)}:${canonText(l.accountCode)}:${canonText(l.accountId)}:D${canonMoney(
          l.debit
        )}:C${canonMoney(l.credit)}:${canonText(l.description)}`
    )
    .sort()
    .join('|');
}

/** تجزئة مضمون القيد المحاسبي بما فيه previousHash (بصمة غير قابلة للتلاعب) */
export function hashJournalEntry(entry: JournalEntry, previousHash: string): string {
  const payload = [
    canonDate(entry.date),
    canonText(entry.entryNumber),
    canonText(entry.status),
    canonText(entry.type),
    canonMoney(entry.totalDebit),
    canonMoney(entry.totalCredit),
    canonText(entry.organizationId),
    canonText(entry.governmentAccountId),
    canonText(entry.governmentCode),
    canonicalLines(entry),
    previousHash,
  ].join('::');
  return `${HASH_PREFIX}${sha256(payload)}`;
}

function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  // ترتيب كلي حتمي: تاريخ ← رقم القيد ← المعرّف. بدون المُعرّف الأخير، قد يختلف
  // ترتيب قيدين بنفس التاريخ والرقم بين تشغيلين فتنكسر السلسلة بلا أي تعديل حقيقي.
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const byNumber = a.entryNumber.localeCompare(b.entryNumber);
    if (byNumber !== 0) return byNumber;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * إعادة بناء سلسلة التجزئة بالكامل حسب ترتيب القيود،
 * وتحديث previousHash/currentHash/chainIndex لكل قيد.
 * تُرجع true إذا كانت السلسلة سليمة (لا تلاعب).
 */
export function rebuildLedgerChain(entries: JournalEntry[]): { chainValid: boolean; tamperedCount: number } {
  const sorted = sortEntries(entries);

  let prevHash = GENESIS_HASH;
  let tamperedCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const expectedHash = hashJournalEntry(entry, prevHash);
    const storedHash = entry.currentHash;
    const versioned = isVersionedLedgerHash(storedHash);
    const hashMatches = versioned && storedHash === expectedHash && entry.previousHash === prevHash;

    entry.previousHash = prevHash;
    entry.chainIndex = i;
    entry.chainVerified = hashMatches;
    if (storedHash === undefined || storedHash === null || storedHash === '') {
      // بلا تجزئة: تُختم الآن (صف جديد أو ترقية)
      entry.currentHash = expectedHash;
    } else if (!versioned) {
      // ترميز قديم غير قابل للتحقق ⇒ ترقية صريحة مسجَّلة، لا تُحتسب تلاعباً
      entry.currentHash = expectedHash;
    } else {
      entry.currentHash = storedHash;
      if (!hashMatches) tamperedCount++;
    }
    prevHash = entry.currentHash;
  }

  return { chainValid: tamperedCount === 0, tamperedCount };
}

/**
 * إعادة ختم السلسلة بالكامل (تُستخدم **فقط** بعد استيراد قيود جديدة وسط سلسلة
 * قائمة: الإدراج في المنتصف يغيّر موضع كل ما بعده، فلا بد من إعادة بناء صريحة).
 * عملية إعادة الختم تُسجَّل في سجل التدقيق حتى لا تكون إصلاحاً صامتاً يخفي تلاعباً.
 */
export function resealLedgerChain(entries: JournalEntry[]): { chainValid: boolean; tamperedCount: number } {
  for (const entry of entries) {
    entry.previousHash = undefined as any;
    entry.currentHash = undefined as any;
    entry.chainIndex = undefined as any;
  }
  return rebuildLedgerChain(entries);
}

/**
 * فحص سلامة السلسلة بدون إعادة بناء (تقرير فقط).
 * يحدد القيود المتغيرة (Hash mismatch) والمواضع المنكسرة (break).
 */
export function verifyLedgerChain(entries: JournalEntry[]): LedgerChainVerificationResult {
  const sorted = sortEntries(entries);

  const tamperedEntries: LedgerChainVerificationResult['tamperedEntries'] = [];
  let prevExpectedHash = GENESIS_HASH;
  let verifiedCount = 0;
  let legacyFormatCount = 0;

  for (const entry of sorted) {
    const expectedHash = hashJournalEntry(entry, prevExpectedHash);
    const stored = entry.currentHash;
    const versioned = isVersionedLedgerHash(stored);
    let reason: 'HASH_MISMATCH' | 'BREAK_IN_CHAIN' | undefined;

    if (versioned) {
      if (entry.previousHash !== prevExpectedHash) {
        reason = 'BREAK_IN_CHAIN';
      } else if (stored !== expectedHash) {
        reason = 'HASH_MISMATCH';
      }
    } else if (stored) {
      // تجزئة موجودة بترميز قديم: غير قابلة للتحقق بهذا الإصدار ⇒ تُرقّى، لا تُتَّهم
      legacyFormatCount++;
    } else {
      // قيد بلا أي تجزئة = غير موثّق أصلاً
      reason = 'BREAK_IN_CHAIN';
    }

    if (reason) {
      tamperedEntries.push({
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        expectedHash,
        storedHash: stored || '',
        reason,
      });
    } else if (versioned) {
      verifiedCount++;
    }
    prevExpectedHash = versioned ? (stored as string) : expectedHash;
  }

  return {
    totalEntries: sorted.length,
    verifiedCount,
    tamperedCount: tamperedEntries.length,
    legacyFormatCount,
    hashVersion: LEDGER_HASH_VERSION,
    chainValid: tamperedEntries.length === 0 && legacyFormatCount === 0,
    tamperedEntries,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * تجزئة قيد جديد وإلحاقه بنهاية سلسلة التجزئة (يُستدعى عند ترحيل القيد).
 * تمرر قائمة القيود الحالية (شاملة القيد الجديد في حالته المرحلة كاملة).
 */
export function appendToLedgerChain(entries: JournalEntry[], entry: JournalEntry): void {
  const prev = [...entries]
    .sort((a, b) => {
      const ai = a.chainIndex ?? 0;
      const bi = b.chainIndex ?? 0;
      return ai - bi;
    })
    .filter((e) => e.id !== entry.id)
    .pop();
  const previousHash = prev?.currentHash || GENESIS_HASH;
  entry.previousHash = previousHash;
  entry.currentHash = hashJournalEntry(entry, previousHash);
  entry.chainIndex = (prev?.chainIndex ?? -1) + 1;
  entry.chainVerified = true;
}
