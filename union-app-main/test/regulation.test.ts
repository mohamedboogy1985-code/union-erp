import assert from 'assert';
import { erpStore } from '../server/db/store.js';
import { accountingService } from '../server/services/accounting.service.js';
import { regulationService } from '../server/services/regulation.service.js';
import { smartAgentEnhancer } from '../server/services/smart-agent.service.js';

/**
 * ===== اختبارات محرك اللائحة المالية (مفعَّل من نص الوثيقة — 86 مادة) =====
 * 1. حالة الإقلاع: 17 مادة مُعبأة + 16 قاعدة نافذة بقيم منقولة من الوثيقة
 * 2. القواعد المنقولة تعمل فوراً: بلوك للحدود المانعة / تحذير للحدود الإرشادية
 * 3. تكامل كامل: قاعدة مانعة تُسقط إنشاء قيد عبر خدمة المحاسبة نفسها
 */

console.log('🧪 Starting Financial Regulation Engine Test Suite...\n');

function runTests() {
  // -------------------------------------------------------------
  // Test 1: حالة الإقلاع — اللائحة مفعّلة بقيم منقولة من الوثيقة
  // -------------------------------------------------------------
  console.log('🔹 Test 1: Boot state — 17 articles filled, 16 rules activated from the document');
  const status0 = regulationService.getStatus();
  assert.strictEqual(status0.articlesCount, 17, 'مواد اللائحة مُعبأة (17 مادة مترقمة من الوثيقة)');
  assert.strictEqual(status0.activeRules.length, 16, '16 قاعدة نافذة منذ الإقلاع بالوثيقة');
  assert.strictEqual(status0.isEnforcing, true);
  assert.ok(status0.pendingRules.length > 0, 'بقية القواعد بانتظار القيمة/الاعتماد');
  // قيد إجمالي بدون بيانات سطور يمر دون تحذيرات تخصصية (لا نتائج كاذبة)
  const zeroViolations = regulationService.checkJournalEntry({ totalDebit: 9_000_000, linesCount: 2 });
  assert.deepStrictEqual(zeroViolations, [], 'بدون سطور تُستخدم للقواعد التخصصية لا تحذير كاذب');
  console.log('  ✅ Passed: regulation is live at boot; aggregate-only entries stay silent.');

  // -------------------------------------------------------------
  // Test 2: ترقيم قاعدة حد الاعتماد — مانعة (BLOCK)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 2: Configure max-approval rule (BLOCK) from an article reference');
  regulationService.configureRule('MAX_JOURNAL_ENTRY_AUTO_APPROVE', 1_000_000, '28', { severity: 'BLOCK' });
  const over = regulationService.checkJournalEntry({ totalDebit: 1_500_000, linesCount: 2 });
  assert.strictEqual(over.length, 1, 'قيد فوق الحد اللائحي يُكتشف');
  assert.strictEqual(over[0].severity, 'BLOCK');
  assert.strictEqual(over[0].articleNo, '28', 'المخالفة تحمل رقم مادتها');
  assert.ok(over[0].message.includes('م28'));
  const under = regulationService.checkJournalEntry({ totalDebit: 500_000, linesCount: 2 });
  assert.deepStrictEqual(under, [], 'قيد تحت الحد يمر');
  console.log('  ✅ Passed: block above threshold, pass below, audit-grade article reference.');

  // -------------------------------------------------------------
  // Test 3: قاعدة المستند المؤيد — تحذيرية (WARN)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 3: Document-required rule (WARN) with/without attachment');
  regulationService.configureRule('DOCUMENT_REQUIRED_ABOVE', 100_000, '31', { severity: 'WARN' });
  const noDoc = regulationService.checkJournalEntry({ totalDebit: 250_000, linesCount: 2, attachmentIds: [] });
  // ملاحظة: القيد قد يلتقط أيضاً قاعدة سابقة — نرشّح قاعدة المستند فقط
  const docViolations = noDoc.filter((v) => v.ruleId === 'DOCUMENT_REQUIRED_ABOVE');
  assert.strictEqual(docViolations.length, 1);
  assert.strictEqual(docViolations[0].severity, 'WARN');
  const withDoc = regulationService.checkJournalEntry({ totalDebit: 250_000, linesCount: 2, attachmentIds: ['doc-1'] });
  assert.strictEqual(withDoc.filter((v) => v.ruleId === 'DOCUMENT_REQUIRED_ABOVE').length, 0, 'مع المستند لا تحذير');
  // نوع REVERSAL مستثنى من شرط المستند
  const reversal = regulationService.checkJournalEntry({ totalDebit: 250_000, linesCount: 2, type: 'REVERSAL' });
  assert.strictEqual(reversal.filter((v) => v.ruleId === 'DOCUMENT_REQUIRED_ABOVE').length, 0, 'القيد العكسي مستثنى');
  console.log('  ✅ Passed: warn on missing document, silent when attached, reversal exempt.');

  // -------------------------------------------------------------
  // Test 4: سقف سلفة العامل كنسبة من الأجر
  // -------------------------------------------------------------
  console.log('\n🔹 Test 4: Employee advance percent-of-salary ceiling');
  regulationService.configureRule('ADVANCE_MAX_PERCENT_OF_SALARY', 50, '45', { severity: 'WARN' });
  const advOver = regulationService.checkEmployeeAdvance({ amount: 6_000, annualOrMonthlySalary: 8_100 });
  assert.strictEqual(advOver.length, 1, '6000 > 50%×8100 يُكتشف');
  const advOk = regulationService.checkEmployeeAdvance({ amount: 3_000, annualOrMonthlySalary: 8_100 });
  assert.deepStrictEqual(advOk, [], '3000 ≤ 50%×8100 يمر');
  console.log('  ✅ Passed: advance ceiling enforced proportionally.');

  // -------------------------------------------------------------
  // Test 5: نسب التوزيع الإلزامية
  // -------------------------------------------------------------
  console.log('\n🔹 Test 5: Mandatory revenue-distribution percentages');
  regulationService.configureRule('REVENUE_DISTRIBUTION_MANDATE', JSON.stringify({ 'org-general': 50 }), '52', { severity: 'BLOCK' });
  const badShare = regulationService.checkDistributionPercentages([{ beneficiaryOrgId: 'org-general', percentage: 60 }]);
  assert.strictEqual(badShare.length, 1);
  const goodShare = regulationService.checkDistributionPercentages([{ beneficiaryOrgId: 'org-general', percentage: 50 }]);
  assert.deepStrictEqual(goodShare, []);
  console.log('  ✅ Passed: mandated shares enforced when configured.');

  // -------------------------------------------------------------
  // Test 6: تكامل شامل — قاعدة مانعة تُسقط إنشاء قيد فعلياً
  // -------------------------------------------------------------
  console.log('\n🔹 Test 6: End-to-end — blocking rule rejects journal entry creation');
  const accountantUser = erpStore.users.find((u) => u.username === 'accountant')!;
  assert.throws(
    () =>
      accountingService.createJournalEntry(
        {
          date: '2026-02-25',
          organizationId: 'org-general',
          description: 'اختبار مخالفة اللائحة',
          lines: [
            { accountId: 'acc-1101', debit: 2_000_000, credit: 0, description: 'مدين' },
            { accountId: 'acc-4101', debit: 0, credit: 2_000_000, description: 'دائن' },
          ],
          userId: accountantUser.id,
        },
        accountantUser
      ),
    /مخالفة اللائحة المالية/,
    'قيد 2,000,000 فوق حد المليون المُرقَّم يجب أن يُرفض برسالة اللائحة'
  );
  console.log('  ✅ Passed: accounting pipeline itself now enforces the regulation.');

  // -------------------------------------------------------------
  // Test 7: المساعد الذكي — البحث في مواد اللائحة المعبأة
  // -------------------------------------------------------------
  console.log('\n🔹 Test 7: Smart agent — searches the filled regulation articles');
  const kbResults = smartAgentEnhancer.searchKnowledgeBase('ما رصيد حساب 1301؟');
  assert.ok(Array.isArray(kbResults), 'البحث يعمل مع قاعدة المعرفة');
  // استعلام عن عمليات (بلا كلمة مفتاحية لائحية) لا ينتج مواد لائحة كاذبة
  assert.strictEqual(kbResults.filter((r) => r.type === 'FINANCIAL_REGULATION_ARTICLE').length, 0);
  // استعلام عن موضوع لائحي (بدل السفر) يرجع المادة 37
  const travelHits = smartAgentEnhancer.searchKnowledgeBase('ما بدل السفر عن الليلة؟');
  assert.ok(
    travelHits.some((r) => r.type === 'FINANCIAL_REGULATION_ARTICLE' && (r.reference || '').includes('المادة 37')),
    'المادة 37 (بدل السفر) تظهر في نتائج البحث بعد تعبئة الوثيقة'
  );
  console.log('  ✅ Passed: agent search stable; filled articles surface on topic queries.');

  // -------------------------------------------------------------
  // Test 8: القواعد التخصصية للسطور (صرف نقدي / بدلات / هدايا / مشتريات)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 8: Line-based rules — cash ceiling, allowances, gifts, procurement');
  const reg8 = regulationService;

  const cashOver = reg8.checkJournalEntry({
    totalDebit: 25_000,
    linesCount: 2,
    lines: [
      { accountCode: '5201', description: 'شراء لوازم مكتبية', debit: 25_000, credit: 0 },
      { accountCode: '1101', description: 'صرف نقدي من الخزينة', debit: 0, credit: 25_000 },
    ],
  });
  assert.strictEqual(cashOver.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING').length, 1, 'صرف نقدي فوق 20 ألف يُكتشف (م9)');
  assert.strictEqual(cashOver.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING')[0].articleNo, '9');

  const cashOk = reg8.checkJournalEntry({
    totalDebit: 10_000,
    linesCount: 2,
    lines: [
      { accountCode: '5201', description: 'مصروفات', debit: 10_000, credit: 0 },
      { accountCode: '1101', description: 'صرف نقدي', debit: 0, credit: 10_000 },
    ],
  });
  assert.strictEqual(cashOk.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING').length, 0, 'تحت السقف النقدي يمر');

  const travelBelowFloor = reg8.checkJournalEntry({
    totalDebit: 150,
    linesCount: 1,
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية ليلة واحدة', debit: 150, credit: 0 }],
  });
  assert.strictEqual(travelBelowFloor.filter((v) => v.ruleId === 'TRAVEL_ALLOWANCE_DAILY_CAP').length, 1, 'أقل من الحد الأدنى 200 (م37)');

  const travelOverIncrease = reg8.checkJournalEntry({
    totalDebit: 450,
    linesCount: 1,
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية خارجية', debit: 450, credit: 0 }],
  });
  assert.strictEqual(travelOverIncrease.filter((v) => v.ruleId === 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT').length, 1, 'زيادة فوق 100% (م37)');

  const transportOver = reg8.checkJournalEntry({
    totalDebit: 350,
    linesCount: 1,
    lines: [{ accountCode: '5402', description: 'بدل انتقال شهري', debit: 350, credit: 0 }],
  });
  assert.strictEqual(transportOver.filter((v) => v.ruleId === 'MONTHLY_TRANSPORT_ALLOWANCE_CAP').length, 1, 'بدل انتقال فوق 300 (م39)');

  const burdenOver = reg8.checkJournalEntry({
    totalDebit: 600,
    linesCount: 1,
    lines: [{ accountCode: '5403', description: 'بدل أعباء وظيفية', debit: 600, credit: 0 }],
  });
  assert.strictEqual(burdenOver.filter((v) => v.ruleId === 'MONTHLY_BURDEN_ALLOWANCE_CAP').length, 1, 'بدل أعباء فوق 500 (م40)');

  const giftsOver = reg8.checkJournalEntry({
    totalDebit: 20_000,
    linesCount: 1,
    lines: [{ accountCode: '5301', description: 'هدايا وفود وضيافة', debit: 20_000, credit: 0 }],
  });
  assert.strictEqual(giftsOver.filter((v) => v.ruleId === 'GIFTS_CEILING_EXCEPTIONAL').length, 1, 'هدايا فوق 10 آلاف (م51)');

  const procureOver = reg8.checkJournalEntry({
    totalDebit: 80_000,
    linesCount: 1,
    lines: [{ accountCode: '5201', description: 'توريد مستلزمات تشغيلية', debit: 80_000, credit: 0 }],
  });
  assert.strictEqual(procureOver.filter((v) => v.ruleId === 'PROC_DIRECT_ORDER_CEILING').length, 1, 'شراء فوق 50 ألف يستلزم ممارسة (م61)');

  const underAll = reg8.checkJournalEntry({
    totalDebit: 3_000,
    linesCount: 1,
    lines: [{ accountCode: '5402', description: 'بدل انتقال شهري', debit: 3_000, credit: 0 }],
    type: 'REVERSAL',
  });
  // السفر/الانتقال/الأعباء تُفحص على أي قيد غير عكسي؛ هذا القيد عكسي فلا ينبغي أن يُفصَّل (تبقى كلمة انتقال مع عكس)
  assert.strictEqual(underAll.length, 0, 'لا تحذيرات للقيد تحت الحدود');
  console.log('  ✅ Passed: cash/allowances/gifts/procurement rules enforced from line data.');

  console.log('\n🎉 ALL REGULATION ENGINE TESTS PASSED SUCCESSFULLY!');
}

runTests();
