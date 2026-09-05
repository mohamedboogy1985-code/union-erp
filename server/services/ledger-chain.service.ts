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

/** تجزئة مضمون القيد المحاسبي بما فيه previousHash (بصمة غير قابلة للتلاعب) */
export function hashJournalEntry(entry: JournalEntry, previousHash: string): string {
  const linesPayload = entry.lines
    .map((l) => `L:${l.lineNumber}:${l.accountCode}:${l.accountId}:D${l.debit}:C${l.credit}:${l.description}`)
    .join('|');
  const payload = [
    entry.date,
    entry.entryNumber,
    entry.status,
    entry.type,
    entry.totalDebit,
    entry.totalCredit,
    entry.organizationId,
    entry.governmentAccountId ?? '',
    entry.governmentCode ?? '',
    linesPayload,
    previousHash,
  ].join('::');
  return sha256(payload);
}

function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.entryNumber.localeCompare(b.entryNumber);
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
    const hashMatches = storedHash === expectedHash && entry.previousHash === prevHash;

    entry.previousHash = prevHash;
    entry.chainIndex = i;
    entry.chainVerified = hashMatches;
    if (storedHash === undefined || storedHash === null || storedHash === '') {
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
 * فحص سلامة السلسلة بدون إعادة بناء (تقرير فقط).
 * يحدد القيود المتغيرة (Hash mismatch) والمواضع المنكسرة (break).
 */
export function verifyLedgerChain(entries: JournalEntry[]): LedgerChainVerificationResult {
  const sorted = sortEntries(entries);

  const tamperedEntries: LedgerChainVerificationResult['tamperedEntries'] = [];
  let prevExpectedHash = GENESIS_HASH;
  let verifiedCount = 0;

  for (const entry of sorted) {
    const expectedHash = hashJournalEntry(entry, prevExpectedHash);
    let reason: 'HASH_MISMATCH' | 'BREAK_IN_CHAIN' | undefined;

    if (entry.previousHash !== prevExpectedHash) {
      reason = 'BREAK_IN_CHAIN';
    } else if (entry.currentHash !== expectedHash) {
      reason = 'HASH_MISMATCH';
    }

    if (reason) {
      tamperedEntries.push({
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        expectedHash,
        storedHash: entry.currentHash || '',
        reason,
      });
    } else {
      verifiedCount++;
    }
    prevExpectedHash = entry.currentHash || expectedHash;
  }

  return {
    totalEntries: sorted.length,
    verifiedCount,
    tamperedCount: tamperedEntries.length,
    chainValid: tamperedEntries.length === 0,
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
