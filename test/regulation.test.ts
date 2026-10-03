import assert from 'assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FINANCIAL_REGULATION_ARTICLES,
  FINANCIAL_REGULATION_SOURCE,
  FINANCIAL_REGULATION_SOURCE_ISSUES,
  FINANCIAL_REGULATION_TEXT_SOURCE,
  REGULATION_ACTIVATED_RULES,
} from '../server/data/financial-regulation.js';
import { erpStore } from '../server/db/store.js';
import { accountingService } from '../server/services/accounting.service.js';
import { regulationService } from '../server/services/regulation.service.js';
import { resolveBasicStatutePath } from '../server/services/regulation-documents.js';
import { smartAgentEnhancer } from '../server/services/smart-agent.service.js';

/**
 * ===== اختبارات محرك اللائحة المالية (مفعَّل من نص الوثيقة — 86 مادة) =====
 * 1. بصمات ملفات المصادر والاقتباسات والقيم النشطة مطابقة لبيانات المراجعة
 * 2. القواعد المنقولة تعمل مع تمييز الجهة، ولا تُفعّل النسب الملتبسة
 * 3. تكامل كامل: قاعدة مانعة تُسقط إنشاء قيد عبر خدمة المحاسبة نفسها
 */

console.log('🧪 Starting Financial Regulation Engine Test Suite...\n');

function runTests() {
  // -------------------------------------------------------------
  // Test 1: مصدر اللائحة، القيم الفعّالة، والاقتباسات المصدرية
  // -------------------------------------------------------------
  console.log('🔹 Test 1: Source fingerprints, citations, and active statutory values');
  const status0 = regulationService.getStatus();
  assert.strictEqual(status0.articlesCount, 17, 'مواد اللائحة المعبأة');
  assert.strictEqual(status0.activeRules.length, REGULATION_ACTIVATED_RULES.length, 'كل قاعدة فعّالة معلنة في ملف البيانات');
  assert.strictEqual(status0.activeRules.length, 29, 'عدد القواعد المصدرية المفعلة');
  assert.strictEqual(status0.isEnforcing, true);
  assert.ok(status0.pendingRules.length > 0, 'القواعد غير الموثقة/غير المرقمة تبقى معلقة');

  const sha256 = (path: string) => createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex');
  assert.strictEqual(FINANCIAL_REGULATION_SOURCE.verificationStatus, 'ATTACHED_COPY_NOT_AUTHENTICATED', 'لا يُدّعى اعتماد رسمي دون نسخة أولية قابلة للمطابقة');
  assert.strictEqual(sha256(FINANCIAL_REGULATION_SOURCE.filePath), FINANCIAL_REGULATION_SOURCE.sha256, 'بصمة PDF المطابق للائحة المرفقة');
  assert.strictEqual(sha256(FINANCIAL_REGULATION_TEXT_SOURCE.filePath), FINANCIAL_REGULATION_TEXT_SOURCE.sha256, 'بصمة نسخة DOCX النصية التي استُخرجت منها الاقتباسات');
  const distributionIssue = FINANCIAL_REGULATION_SOURCE_ISSUES.find((issue) => issue.id === 'FR-SOURCE-CONFLICT-ARTICLE-2');
  assert.ok(distributionIssue, 'يُسجل تعارض المادة 2 مع نموذج التحصيل كمسألة غير محسومة');
  assert.strictEqual(sha256(distributionIssue!.sourcePath), distributionIssue!.sourceSha256, 'بصمة نموذج التحصيل التشغيلي');
  const runtimeDistributionIssue = FINANCIAL_REGULATION_SOURCE_ISSUES.find((issue) => issue.id === 'FR-RUNTIME-DISTRIBUTION-MISMATCH');
  assert.ok(runtimeDistributionIssue, 'يُسجل اختلاف قاعدة الإيصالات الحية عن نص المادة');
  assert.strictEqual(sha256(runtimeDistributionIssue!.sourcePath), runtimeDistributionIssue!.sourceSha256, 'بصمة قاعدة التوزيع التشغيلية الحالية');
  const printingBasisIssue = FINANCIAL_REGULATION_SOURCE_ISSUES.find((issue) => issue.id === 'FR-ARTICLE-2-PROFESSIONAL-PRINTING-BASIS');
  assert.ok(printingBasisIssue, 'يبقى أساس نسبة المطبوعات المضافة في ملف اللجان المهنية معلّقاً');
  assert.strictEqual(sha256(printingBasisIssue!.sourcePath), printingBasisIssue!.sourceSha256, 'بصمة ملف اللجان المهنية المحدث');
  const article2Note = FINANCIAL_REGULATION_ARTICLES.find((article) => article.articleNo === '2')?.sourceCitation?.noteAr || '';
  assert.match(article2Note, /CSV النهائي 30\/10\/10\/50/);
  assert.match(article2Note, /50\/30\/20/);
  assert.match(article2Note, /المطبوعات 10% بلا قيم أو معادلات/);
  const activeMembershipRule = erpStore.distributionRules.find((rule) => rule.ruleCode === 'DIST-MEMB-V1');
  assert.deepStrictEqual(activeMembershipRule?.lines.map((line) => line.percentage), [50, 30, 20], 'يحافظ الاختبار على النموذج التشغيلي الحالي ولا يدّعي مطابقته للمادة 2');
  const liveReceiptMismatch = regulationService.checkDistributionPercentages(
    (activeMembershipRule?.lines ?? []).map((line) => ({ beneficiaryOrgId: line.beneficiaryOrgId, percentage: line.percentage }))
  );
  assert.strictEqual(liveReceiptMismatch.length, 2, 'يُظهر فاحص المادة 2 تعارض النموذج التشغيلي الحالي بدلاً من إخفائه');

  const activeById = new Map(status0.activeRules.map((rule) => [rule.ruleId, rule] as const));
  const expectedValues: Record<string, number | string> = {
    PETTY_CASH_CEILING: 50_000,
    PETTY_CASH_CEILING_BRANCH: 20_000,
    CASH_PAYMENT_CEILING: 20_000,
    CASH_PAYMENT_CEILING_BRANCH: 10_000,
    TRAVEL_ALLOWANCE_DAILY_CAP: 2_000,
    TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH: 100,
    MONTHLY_TRANSPORT_ALLOWANCE_CAP: 3_000,
    MONTHLY_BURDEN_ALLOWANCE_CAP: 5_000,
    GIFTS_CEILING_REGULAR: 5_000,
    GIFTS_CEILING_EXCEPTIONAL: 100_000_000,
    PROC_DIRECT_ORDER_CEILING: 50_000,
    PROC_DIRECT_ORDER_CEILING_BRANCH: 20_000,
    PROC_TENDER_CEILING: 200_000,
    PROC_TENDER_CEILING_BRANCH: 100_000,
    PROC_LIMITED_TENDER_CEILING: 500_000,
    PROC_LIMITED_TENDER_CEILING_BRANCH: 250_000,
    CONTRACT_ADVANCE_PCT: 25,
    CONTRACT_WORKS_PROGRESS_PCT: 5,
    CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT: 5,
    CONTRACT_MATERIALS_SUPPLY_PCT: 75,
    CONTRACT_SUPPLY_VARIATION_PCT: 15,
    CONTRACT_WORKS_VARIATION_PCT: 25,
    CONTRACTOR_CLEARANCE_REQUIRED: 'true',
    PENALTY_CAP_PCT: 15,
    PENALTY_CAP_SUPPLY_PCT: 4,
  };
  for (const [ruleId, expected] of Object.entries(expectedValues)) {
    assert.strictEqual(activeById.get(ruleId)?.value, expected, `قيمة ${ruleId} منقولة من المادة الصحيحة`);
  }
  const criticalArticleLinks: Record<string, string> = {
    PETTY_CASH_CEILING_BRANCH: '6',
    CASH_PAYMENT_CEILING_BRANCH: '9',
    TRAVEL_ALLOWANCE_DAILY_CAP: '37',
    TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH: '37',
    GIFTS_CEILING_EXCEPTIONAL: '50',
    PROC_LIMITED_TENDER_CEILING_BRANCH: '61',
    CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT: '72',
    PENALTY_CAP_PCT: '73',
    PENALTY_CAP_SUPPLY_PCT: '73',
    REVENUE_DISTRIBUTION_MANDATE: '2',
  };
  for (const [ruleId, articleNo] of Object.entries(criticalArticleLinks)) {
    assert.strictEqual(activeById.get(ruleId)?.articleNo, articleNo, `${ruleId} مرتبط بالمادة ${articleNo}`);
  }
  assert.strictEqual(activeById.has('CONTRACT_PROGRESS_PAYMENT_PCT'), false, 'لا توجد عتبة 95% في المصدر');
  for (const config of REGULATION_ACTIVATED_RULES) {
    const article = FINANCIAL_REGULATION_ARTICLES.find((candidate) => candidate.articleNo === config.articleNo);
    assert.ok(article?.sourceCitation, `المادة ${config.articleNo} لها اقتباس مصدر`);
    assert.strictEqual(article?.sourceCitation?.sourceId, FINANCIAL_REGULATION_TEXT_SOURCE.id);
    assert.strictEqual(article?.sourceCitation?.sourcePath, FINANCIAL_REGULATION_TEXT_SOURCE.filePath);
    assert.strictEqual(article?.sourceCitation?.sourceSha256, FINANCIAL_REGULATION_TEXT_SOURCE.sha256);
    assert.ok(article?.enforcementRuleIds?.includes(config.ruleId), `المادة ${config.articleNo} تربط القاعدة ${config.ruleId}`);
  }
  const requiredQuoteFragments: Record<string, string[]> = {
    '2': ['10%', '60%', '30%'],
    '6': ['خمسين ألف جنيه', 'عشرين ألف جنيه'],
    '9': ['عشرين ألف جنيه', 'عشرة آلاف جنيه'],
    '37': ['2000.00', '100 جنيه', '100%'],
    '39': ['3000.00'],
    '40': ['5000.00'],
    '50': ['5000.00', '100.000.000'],
    '61': ['20000', '50000', '100000', '200000', '250000', '500000'],
    '72': ['25%', '75%', '5%', '5%) الباقية'],
    '73': ['15%', '4%'],
  };
  for (const [articleNo, fragments] of Object.entries(requiredQuoteFragments)) {
    const quote = FINANCIAL_REGULATION_ARTICLES.find((article) => article.articleNo === articleNo)?.sourceCitation?.quoteAr || '';
    for (const fragment of fragments) assert.ok(quote.includes(fragment), `اقتباس المادة ${articleNo} يتضمن القيمة المصدرية ${fragment}`);
  }
  assert.ok(FINANCIAL_REGULATION_ARTICLES.find((article) => article.articleNo === '72')?.sourceCitation?.noteAr?.includes('95%'));
  const aiServiceSource = readFileSync(resolve(process.cwd(), 'server/services/ai.service.ts'), 'utf8');
  assert.doesNotMatch(aiServiceSource, /الصرف النقدي فوق 20,000 ج\.م محظور نقداً/);
  assert.doesNotMatch(aiServiceSource, /المشتريات بدون مستند تُرفض فوق 20,000 ج\.م/);
  assert.match(aiServiceSource, /قاعدة إيصالات العضوية التشغيلية الحالية/);

  // المادة 2: 10% للاتحاد (إن وجد)، 60% إجمالي للجان، 30% للنقابة العامة.
  const statutoryDistribution = regulationService.checkDistributionPercentages([
    { beneficiaryOrgId: 'org-general', percentage: 30 },
    { beneficiaryOrgId: 'org-east-committee', percentage: 40 },
    { beneficiaryOrgId: 'org-west-committee', percentage: 20 },
  ]);
  assert.deepStrictEqual(statutoryDistribution, [], 'تُجمع نسب اللجان، والاتحاد اختياري إذا لم يوجد');

  // قيد إجمالي بدون بيانات سطور يمر دون تحذيرات تخصصية (لا نتائج كاذبة).
  const zeroViolations = regulationService.checkJournalEntry({ totalDebit: 9_000_000, linesCount: 2 });
  assert.deepStrictEqual(zeroViolations, [], 'بدون سطور تُستخدم للقواعد التخصصية لا تحذير كاذب');
  console.log('  ✅ Passed: source fingerprints and statutory values verified; runtime distribution conflict remains explicit.');
  assert.ok(resolveBasicStatutePath(), 'مسح لائحة النظام الأساسي موجود للعرض الكامل');

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
  // Test 8: القواعد التخصصية مع فروق الجهات وحدود المادتين 37 و61
  // -------------------------------------------------------------
  console.log('\n🔹 Test 8: Entity-specific cash, travel, allowance, gift, and procurement rules');
  const reg8 = regulationService;

  const cashGeneralOver = reg8.checkJournalEntry({
    totalDebit: 25_000,
    linesCount: 2,
    entityLevel: 'GENERAL_UNION',
    lines: [
      { accountCode: '5201', description: 'مصروف', debit: 25_000, credit: 0 },
      { accountCode: '1101', description: 'صرف نقدي من الخزينة', debit: 0, credit: 25_000 },
    ],
  });
  assert.strictEqual(cashGeneralOver.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING').length, 1, 'تجاوز حد النقابة العامة 20,000 (م9)');

  const cashCommitteeOver = reg8.checkJournalEntry({
    totalDebit: 11_000,
    linesCount: 2,
    entityLevel: 'COMMITTEE',
    lines: [
      { accountCode: '5201', description: 'مصروف', debit: 11_000, credit: 0 },
      { accountCode: '1101', description: 'صرف نقدي', debit: 0, credit: 11_000 },
    ],
  });
  assert.strictEqual(cashCommitteeOver.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING_BRANCH').length, 1, 'تجاوز حد اللجنة 10,000 (م9)');

  const cashCommitteeOk = reg8.checkJournalEntry({
    totalDebit: 10_000,
    linesCount: 2,
    entityLevel: 'COMMITTEE',
    lines: [
      { accountCode: '5201', description: 'مصروف', debit: 10_000, credit: 0 },
      { accountCode: '1101', description: 'صرف نقدي', debit: 0, credit: 10_000 },
    ],
  });
  assert.strictEqual(cashCommitteeOk.filter((v) => v.ruleId === 'CASH_PAYMENT_CEILING_BRANCH').length, 0, 'المبلغ عند حد اللجنة يمر');

  const travelBelowFloor = reg8.checkJournalEntry({
    totalDebit: 1_500,
    linesCount: 1,
    entityLevel: 'GENERAL_UNION',
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية', travelNights: 1, debit: 1_500, credit: 0 }],
  });
  assert.strictEqual(travelBelowFloor.filter((v) => v.ruleId === 'TRAVEL_ALLOWANCE_DAILY_CAP').length, 1, 'أقل من الحد الأدنى 2,000 للنقابة العامة (م37)');

  const travelWithoutNightCount = reg8.checkJournalEntry({
    totalDebit: 1_500,
    linesCount: 1,
    entityLevel: 'GENERAL_UNION',
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية مجمع', debit: 1_500, credit: 0 }],
  });
  assert.strictEqual(travelWithoutNightCount.filter((v) => v.ruleId.startsWith('TRAVEL_ALLOWANCE')).length, 0, 'لا تقارن قيمة إجمالية بحد الليلة دون عدد الليالي');

  const travelCommitteeBelow = reg8.checkJournalEntry({
    totalDebit: 99,
    linesCount: 1,
    entityLevel: 'COMMITTEE',
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية', travelNights: 1, debit: 99, credit: 0 }],
  });
  assert.strictEqual(travelCommitteeBelow.filter((v) => v.ruleId === 'TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH').length, 1, 'حد اللجنة 100 جنيه لليلة (م37)');

  const travelOverIncrease = reg8.checkJournalEntry({
    totalDebit: 4_500,
    linesCount: 1,
    entityLevel: 'GENERAL_UNION',
    lines: [{ accountCode: '5401', description: 'بدل سفر مأمورية خارجية', travelNights: 1, debit: 4_500, credit: 0 }],
  });
  assert.strictEqual(travelOverIncrease.filter((v) => v.ruleId === 'TRAVEL_ALLOWANCE_MAX_INCREASE_PCT').length, 1, 'زيادة تتجاوز 100% من الحد الأدنى (م37)');

  const transportOver = reg8.checkJournalEntry({
    totalDebit: 3_500,
    linesCount: 1,
    lines: [{ accountCode: '5402', description: 'بدل انتقال شهري', debit: 3_500, credit: 0 }],
  });
  assert.strictEqual(transportOver.filter((v) => v.ruleId === 'MONTHLY_TRANSPORT_ALLOWANCE_CAP').length, 1, 'بدل انتقال فوق 3,000 (م39)');

  const burdenOver = reg8.checkJournalEntry({
    totalDebit: 6_000,
    linesCount: 1,
    lines: [{ accountCode: '5403', description: 'بدل أعباء وظيفية', boardMember: false, debit: 6_000, credit: 0 }],
  });
  assert.strictEqual(burdenOver.filter((v) => v.ruleId === 'MONTHLY_BURDEN_ALLOWANCE_CAP').length, 1, 'بدل أعباء فوق 5,000 (م40)');
  const burdenWithoutMemberStatus = reg8.checkJournalEntry({
    totalDebit: 6_000,
    linesCount: 1,
    lines: [{ accountCode: '5403', description: 'بدل أعباء وظيفية', debit: 6_000, credit: 0 }],
  });
  assert.strictEqual(burdenWithoutMemberStatus.filter((v) => v.ruleId === 'MONTHLY_BURDEN_ALLOWANCE_CAP').length, 0, 'لا يطبق الحد دون معرفة صفة المستفيد');
  const boardMemberBurden = reg8.checkJournalEntry({
    totalDebit: 6_000,
    linesCount: 1,
    lines: [{ accountCode: '5403', description: 'بدل أعباء وظيفية', boardMember: true, debit: 6_000, credit: 0 }],
  });
  assert.strictEqual(boardMemberBurden.filter((v) => v.ruleId === 'MONTHLY_BURDEN_ALLOWANCE_CAP').length, 0, 'استثناء عضو هيئة المكتب لا يصدر تحذيراً آلياً إذا سُجل صراحةً');

  const giftsOver = reg8.checkJournalEntry({
    totalDebit: 20_000,
    linesCount: 1,
    lines: [{ accountCode: '5301', description: 'هدايا وفود وضيافة', debit: 20_000, credit: 0 }],
  });
  assert.strictEqual(giftsOver.filter((v) => v.ruleId === 'GIFTS_CEILING_REGULAR').length, 1, 'تجاوز 5,000 يتطلب التحقق من قرار الاستثناء بالمادة 50');
  assert.strictEqual(giftsOver.filter((v) => v.ruleId === 'GIFTS_CEILING_EXCEPTIONAL').length, 0, '20,000 دون الحد الاستثنائي المطبوع 100,000,000');

  const procureOver = reg8.checkJournalEntry({
    totalDebit: 80_000,
    linesCount: 1,
    entityLevel: 'GENERAL_UNION',
    lines: [{ accountCode: '5201', description: 'توريد مستلزمات تشغيلية', debit: 80_000, credit: 0 }],
  });
  assert.strictEqual(procureOver.filter((v) => v.ruleId === 'PROC_DIRECT_ORDER_CEILING').length, 1, 'شراء عام فوق 50,000 يستلزم مراجعة إجراء الممارسة (م61)');

  const branchPracticeOver = reg8.checkJournalEntry({
    totalDebit: 150_000,
    linesCount: 1,
    entityLevel: 'COMMITTEE',
    lines: [{ accountCode: '5201', description: 'شراء لوازم', debit: 150_000, credit: 0 }],
  });
  assert.strictEqual(branchPracticeOver.filter((v) => v.ruleId === 'PROC_TENDER_CEILING_BRANCH').length, 1, 'تجاوز ممارسة اللجنة 100,000 (م61)');

  const branchLimitedTenderOver = reg8.checkJournalEntry({
    totalDebit: 300_000,
    linesCount: 1,
    entityLevel: 'COMMITTEE',
    lines: [{ accountCode: '5201', description: 'شراء معدات', debit: 300_000, credit: 0 }],
  });
  assert.strictEqual(branchLimitedTenderOver.filter((v) => v.ruleId === 'PROC_LIMITED_TENDER_CEILING_BRANCH').length, 1, 'تجاوز مناقصة اللجنة المحدودة 250,000 (م61)');

  const underAll = reg8.checkJournalEntry({
    totalDebit: 3_000,
    linesCount: 1,
    lines: [{ accountCode: '5402', description: 'بدل انتقال شهري', debit: 3_000, credit: 0 }],
    type: 'REVERSAL',
  });
  assert.strictEqual(underAll.length, 0, 'القيد العكسي مستثنى من الفحوص التخصصية');
  console.log('  ✅ Passed: source-correct thresholds and entity-specific checks are exercised.');

  console.log('\n🎉 ALL REGULATION ENGINE TESTS PASSED SUCCESSFULLY!');
}

runTests();
