/**
 * إصلاح تكرار المعرّفات في سلسلة الأستاذ (استيراد قيود اليومية من CSV)
 * =====================================================================
 * ما كان يحدث قبل الإصلاح (مقيس على ملفات server/data الحقيقية):
 *   • معرّف القيد = `jei-<سنة-شهر>-<المسلسل>` ونمرته = `JV-<السنة>-<المسلسل>`،
 *     والمسلسل يبدأ من جديد في كل ملف ⇒ 23 معرّفاً مكرراً و51 نمرة قيد مكررة.
 *   • القاعدة تفرض تفرّد (id, entry_number) ⇒ 52 قيداً حقيقياً لا تُخزَّن أبداً
 *     («بلا تخزين») فتغيب عن سلسلة السجل الرسمي وتبقى نمرتها مكررة في الشاشات.
 *   • `قيود_اليومية_2024.csv` و`قيود_اليومية_2024_c.csv` متماثلان بايتاً ببايت ⇒
 *     تُستورد القيود مرتين فتتضاعف أرصدة الحسابات والأطراف في الذاكرة.
 *
 * ما تثبته هذه الاختبارات:
 *   1) ملف مطابق تماماً لملف آخر يُستورد مرة واحدة، وتُحتسب قيوده «متجاهَلة».
 *   2) تصادم حقيقي (نفس الشهر/السنة بمحتوى مختلف) ⇒ معرّف ونمرة فريدان بلاحقة حتمية.
 *   3) إعادة استيراد الملف نفسه لا تضيف صفاً واحداً (لا تكرار في القاعدة/السلسلة).
 *   4) سلسلة الأستاذ: لا معرّف ولا نمرة مكررة، والتحقق سليم بعد إعادة البناء.
 *
 * التشغيل: npx tsx --test test/csv-import-identifiers.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_DATA = path.resolve(process.cwd(), 'server', 'data');

// مجلد بيانات مؤقت معزول: الدليل الموحد الحقيقي + ملفا قيود متماثلان تماماً.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'union-csv-'));
process.env.UNION_DATA_DIR = DATA_DIR; // يُقرأ عند استيراد خدمة CSV (CSV_DATA_DIR)

const HEADER = 'التاريخ,المسلسل,رقم الإذن,رقم الشيك,البيان,حساب مدين,حساب دائن,المبلغ,مرحّل';
const DEBIT_ACCOUNT = 'مدينون متنوعون';
const CREDIT_ACCOUNT = 'إيرادات المتنوعة';

const rowsCsv = (rows: { date: string; serial: number; amount: number; desc: string }[]) =>
  [
    HEADER,
    ...rows.map(
      (r) =>
        `${r.date},${r.serial},35${String(r.serial).padStart(3, '0')},,${r.desc},${DEBIT_ACCOUNT},${CREDIT_ACCOUNT},${r.amount},نعم`
    ),
  ].join('\n');

// نفس المسلسل (1) في شهرين مختلفين من نفس السنة: التصادم الأصلي في النمرة.
const TWIN_CSV = rowsCsv([
  { date: '2024-01-05', serial: 1, amount: 1000, desc: 'قيد اختبار يناير' },
  { date: '2024-02-07', serial: 1, amount: 2000, desc: 'قيد اختبار فبراير' },
]);

fs.copyFileSync(
  path.join(REPO_DATA, 'دليل_الحسابات_الموحد_النهائي.csv'),
  path.join(DATA_DIR, 'دليل_الحسابات_الموحد_النهائي.csv')
);
fs.writeFileSync(path.join(DATA_DIR, 'قيود_اختبار_أ.csv'), TWIN_CSV, 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'قيود_اختبار_ب.csv'), TWIN_CSV, 'utf-8'); // نسخة مطابقة بايتاً ببايت

const { erpStore } = await import('../server/db/store.js');
const { csvImportService } = await import('../server/services/csv-import.service.js');
const { rebuildLedgerChain, verifyLedgerChain } = await import('../server/services/ledger-chain.service.js');

const admin = erpStore.users[0];
const imported2024 = () => erpStore.journalEntries.filter((e) => e.id.startsWith('jei-2024-'));

test('ملف قيود مطابق تماماً لملف آخر يُستورد مرة واحدة فقط', () => {
  const summary = csvImportService.loadRealDataFromCsvFiles();
  assert.equal(summary.loaded, true, 'حُمّلت بيانات المجلد المؤقت');
  assert.ok(summary.entries, 'خلاصة القيود متاحة');
  assert.equal(summary.entries!.imported, 2, 'قيود الملف الأول فقط');
  assert.equal(summary.entries!.duplicatesSkipped, 2, 'قيود الملف المطابق تُحتسب متجاهَلة');

  const imported = imported2024();
  assert.equal(imported.length, 2, 'لا استيراد مزدوج للملف المتماثل');
  assert.equal(new Set(imported.map((e) => e.id)).size, 2, 'لا معرّف مكرر');
  assert.equal(new Set(imported.map((e) => e.entryNumber)).size, 2, 'لا نمرة قيد مكررة');
});

test('استيراد CSV للدليل لا يمسح قواعد الإيصالات التشغيلية ولا يعيد تعيين COA المفتوح', () => {
  const rules = erpStore.distributionRules
    .map((rule) => ({
      ruleCode: rule.ruleCode,
      percentages: rule.lines.map((line) => line.percentage),
      accountIds: rule.lines.map((line) => line.accountId),
    }))
    .sort((a, b) => a.ruleCode.localeCompare(b.ruleCode));
  assert.deepEqual(rules, [
    { ruleCode: 'DIST-CERT-V1', percentages: [70, 30], accountIds: ['acc-4102', 'acc-2102'] },
    { ruleCode: 'DIST-MEMB-V1', percentages: [50, 30, 20], accountIds: ['acc-4101', 'acc-2102', 'acc-2102'] },
  ]);
});

test('نفس السنة والمسلسل في شهرين مختلفين ⇒ نمرة ثانية بلاحقة حتمية', () => {
  const numbers = imported2024()
    .map((e) => e.entryNumber)
    .sort();
  assert.deepEqual(numbers, ['JV-2024-0001', 'JV-2024-0001-2']);
});

test('إعادة استيراد الملف نفسه لا تضيف قيوداً ولا تكراراً', () => {
  const before = erpStore.journalEntries.length;
  const summary = csvImportService.importJournalEntriesCsv(TWIN_CSV, admin, 'يومية النقابة');
  assert.equal(summary.imported, 0, 'لا قيود جديدة');
  assert.equal(summary.duplicatesSkipped, 2, 'القيود المطابقة تُتجاهل');
  assert.equal(erpStore.journalEntries.length, before, 'عدد القيود لم يتغير');
});

test('قيد مختلف بنفس (الشهر + المسلسل) يأخذ معرّفاً ونمرة فريدين', () => {
  const csv = rowsCsv([
    { date: '2024-01-09', serial: 1, amount: 777, desc: 'قيد اختبار تصادم المعرّفات' },
  ]);
  const summary = csvImportService.importJournalEntriesCsv(csv, admin, 'يومية النقابة');
  assert.equal(summary.imported, 1);

  const entry = erpStore.journalEntries.find((e) => e.description.includes('تصادم المعرّفات'));
  assert.ok(entry, 'القيد أُدرج');
  assert.notEqual(entry!.id, 'jei-2024-01-1', 'المعرّف الأساسي محجوز لقيد آخر');
  assert.match(entry!.id, /^jei-2024-01-1-\d+$/, 'لاحقة حتمية على المعرّف');
  assert.match(entry!.entryNumber, /^JV-2024-0001-\d+$/, 'لاحقة حتمية على النمرة');
  assert.equal(erpStore.journalEntries.filter((e) => e.id === entry!.id).length, 1, 'لا معرّف مكرر');
});

test('سلسلة الأستاذ: لا معرّفات ولا نمر مكررة، والتحقق سليم', () => {
  const ids = erpStore.journalEntries.map((e) => e.id);
  const numbers = erpStore.journalEntries.map((e) => e.entryNumber);
  assert.equal(new Set(ids).size, ids.length, 'معرّف القيد فريد في السلسلة');
  assert.equal(new Set(numbers).size, numbers.length, 'نمرة القيد فريدة في السلسلة');

  rebuildLedgerChain(erpStore.journalEntries);
  const result = verifyLedgerChain(erpStore.journalEntries);
  assert.equal(result.tamperedCount, 0);
  assert.equal(result.legacyFormatCount, 0);
  assert.equal(result.verifiedCount, erpStore.journalEntries.length);
});
