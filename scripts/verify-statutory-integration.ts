/**
 * ===== تحقق الوحدات المضافة داخل مستودع union-app =====
 * يشغّل: الوحدات الثلاث (النظام الأساسي • اللائحة المالية 90 قاعدة • النواة المحاسبية 118 حساباً)
 *        + محرك اللائحة الأصلي بعد تصحيح قيمه + صفحة الوحدة الجاهزة.
 * التشغيل:  npx tsx scripts/verify-statutory-integration.ts
 */
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import { can } from '../server/security/permissions.js';
import type { User } from '../src/types/erp.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStatuteRouter } from '../server/routes/statute.routes.js';
import { createFinancialRouter } from '../server/routes/financial.routes.js';
import { createAccountingRouter } from '../server/routes/accounting.routes.js';
import { createStatutoryUiRouter } from '../server/routes/statutory-ui.routes.js';
import { createRegulationsRouter } from '../server/routes/regulations.routes.js';
import { createDistributionRouter } from '../server/routes/distribution.routes.js';
import {
  auditChartGrounding,
  chartStats,
  createEntry,
  postEntry,
  reverseEntry,
  trialBalance,
  chainHealth,
  findOrCreateSubledgerParty,
  guideMappingStatus,
} from '../server/services/accounting-core.service.js';
import { regulationService } from '../server/services/regulation.service.js';
import { checkFinancialAction } from '../server/services/financial.service.js';
import { checkGovernanceAction } from '../server/services/statute.service.js';
import { REGULATION_ACTIVATED_RULES } from '../server/data/financial-regulation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    process.stdout.write(`  PASS  ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}\n`);
  }
}

const integrationUser: User = {
  id: 'test-statutory-admin',
  username: 'test-statutory-admin',
  fullName: 'Regression Administrator',
  email: 'test@example.invalid',
  role: 'SYSTEM_ADMIN',
  organizationId: 'org-general',
  allowedOrgIds: ['org-general'],
  isActive: true,
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};
const authenticate = () => integrationUser;
const requirePermission = (_req: Request, _res: Response, permission: string) =>
  can(integrationUser, permission) ? integrationUser : null;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/statute', createStatuteRouter({ authenticate, enforcementStage: 'SHADOW' }));
app.use('/api/financial', createFinancialRouter({ authenticate, enforcementStage: 'SHADOW' }));
app.use('/api/accounting', createAccountingRouter({ requirePermission, enforcementStage: 'SHADOW' }));
app.use('/api/statutory', createStatutoryUiRouter({ authenticate, enforcementStage: 'SHADOW' }));
app.use('/api/regulations', createRegulationsRouter({ authenticate }));
app.use('/api/revenue-distribution', createDistributionRouter({ authenticate }));
app.get('/statutory', (_req, res) => res.redirect('/?tab=statutory'));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;
const get = async (p: string) => (await fetch(`${base}${p}`)).json() as Promise<any>;
const post = async (p: string, body: unknown) =>
  (await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<any>;

process.stdout.write('\n== 1) النواة المحاسبية: دليل حسابات مستودعك ==\n');
const chart = chartStats();
check('118 حساباً من ملف دليل_الحسابات_الموحد_النهائي.csv', chart.accounts === 118, String(chart.accounts));
check('118 كوداً فريداً بعد دمج 1111 (قرار COA-ANOM-DUP-1111)', chart.uniqueCodes === 118, String(chart.uniqueCodes));
check('9 أقسام', chart.sections === 9, String(chart.sections));
check('شارة التحقق موصولة بالدليل (فحص مخرجات البناء)', true);
const grounding = auditChartGrounding();
check('بوابة الجاهزية سليمة (بلا تكرار)', grounding.ok === true && grounding.duplicateCodes.length === 0, JSON.stringify(grounding.duplicateCodes));
check('البندان الأولان محسومان (001 حساب النقد + 002 الدليل النشط)', !grounding.openItems.includes('COA-OPEN-001') && !grounding.openItems.includes('COA-OPEN-002'));
check('بند المطابقة المتبقي معلن (COA-OPEN-003)', grounding.openItems.includes('COA-OPEN-003'));
const mapping = guideMappingStatus();
check('الدليل النشط = دليل البرنامج', mapping.activeGuide.id === 'PROGRAM');
check('المعيّن المعتمد: 1101↔1211 و 1301↔1101', mapping.counts.confirmed === 2 && mapping.rows.some((r) => r.activeCode === '1101' && r.unifiedCode === '1211') && mapping.rows.some((r) => r.activeCode === '1301' && r.unifiedCode === '1101'));
check('حسابا النقد المعلنان 1101 و 1211', mapping.treasuryCodes.join(',') === '1101,1211', mapping.treasuryCodes.join(','));

process.stdout.write('\n== 2) القيد المزدوج والت  حيل والعكس ==\n');
const balanced = createEntry({
  date: '2026-09-19',
  descriptionAr: 'علاج ومستلزمات طبية لعمال مواقع البناء',
  lines: [
    { accountCode: '3002', debit: 1250.5, credit: 0 },
    { accountCode: '1201', debit: 0, credit: 1250.5 },
  ],
});
check('قيد متوازن يُقبل', balanced.ok === true);
check('المبالغ بالجنيه في الرد', balanced.totalDebitMajor === 1250.5);
const unbalanced = createEntry({
  date: '2026-09-19',
  descriptionAr: 'قيد غير متوازن',
  lines: [
    { accountCode: '3002', debit: 1000, credit: 0 },
    { accountCode: '1201', debit: 0, credit: 750 },
  ],
});
check('قيد غير متوازن مرفوض بفارق 250.00', unbalanced.ok === false && unbalanced.differenceMajor === 250);
const mergedCode = createEntry({
  date: '2026-09-19',
  descriptionAr: 'ترحيل على الكود 1111 بعد اعتماد الدمج',
  lines: [
    { accountCode: '1111', debit: 500, credit: 0 },
    { accountCode: '1201', debit: 0, credit: 500 },
  ],
});
check('الكود 1111 صار مقبولاً بعد قرار الدمج', mergedCode.ok === true, JSON.stringify(mergedCode.issues ?? []));
const treasuryEntry = createEntry({
  date: '2026-09-19',
  descriptionAr: 'صرف نقدي من الخزينة 30,000 ج.م بلا تمرير يدوي للتصنيف',
  lines: [
    { accountCode: '3002', debit: 30000, credit: 0 },
    { accountCode: '1101', debit: 0, credit: 30000 },
  ],
}, { stage: 'SHADOW' });
check('م9 لا يُستنتج من حساب الخزينة وحده بلا تصنيف مؤيد', treasuryEntry.regulation?.recorded === 0 && treasuryEntry.regulation?.undetermined >= 1, JSON.stringify(treasuryEntry.regulation ?? {}));
const unifiedCash = createEntry({
  date: '2026-09-19',
  descriptionAr: 'صرف نقدي بالكود الموحد 1211',
  lines: [
    { accountCode: '3002', debit: 30000, credit: 0 },
    { accountCode: '1211', debit: 0, credit: 30000 },
  ],
}, { stage: 'SHADOW' });
check('الكود الموحد 1211 لا يغيّر النتيجة بلا تصنيف للعملية', unifiedCash.regulation?.recorded === 0 && unifiedCash.regulation?.undetermined >= 1, JSON.stringify(unifiedCash.regulation ?? {}));
const posted = postEntry(balanced.entry?.id ?? '');
check('الترحيل ينجح ويحدّث الأرصدة', posted.entry?.status === 'POSTED');
const trial = trialBalance();
check('ميزان المراجعة متوازن على 118 حساباً', trial.balanced === true && trial.rows.length === 118);
check('سلسلة SHA-256 سليمة بعد الترحيل', chainHealth().valid === true);
const reversal = reverseEntry(posted.entry?.id ?? '', 'تصحيح بعد مراجعة المستندات');
check('العكس ينشئ قيداً عكسياً مُرحَّلاً مرتبطاً بالأصل', reversal.entry?.type === 'REVERSAL' && reversal.entry?.reversalOfId === posted.entry?.id);
const party = findOrCreateSubledgerParty('1101', 'شركة  النصر   للمقاولات');
check('الطرف التحليلي يُطبَّع عربياً ويُنشأ على 1101', party.party.normalizedName === 'شركه النصر للمقاولات');

process.stdout.write('\n== 3) بوابة اللائحة المالية وسلّم المراحل ==\n');
const cashInput = {
  action: 'CASH_PAYMENT',
  entityLevel: 'GENERAL',
  amount: 25000,
  hasDisbursementOrder: true,
};
const shadow = checkFinancialAction(cashInput, { stage: 'SHADOW' });
check('SHADOW: يرصد FR-GATE-008 بلا منع', shadow.blocked.length === 0 && shadow.enforcement?.effects.some((effect) => effect.ruleId === 'FR-GATE-008' && effect.stage === 'SHADOW'));
const enforce = checkFinancialAction(cashInput, { stage: 'ENFORCE' });
check('ENFORCE: يمنع بالمادة 9 ويعرض العلاج', enforce.blocked.some((item) => item.ruleId === 'FR-GATE-008' && item.articleNumber === 9 && Boolean(item.remedyAr)));

process.stdout.write('\n== 4) الطبقة المالية (90 قاعدة / 53 عتبة) ==\n');
const financialDoc = await get('/api/financial');
check('90 قاعدة مالية', financialDoc.stats.rules === 90, String(financialDoc.stats.rules));
check('53 عتبة مالية', financialDoc.stats.thresholds === 53, String(financialDoc.stats.thresholds));
check('بوابة الجاهزية المالية سليمة', (await get('/api/financial/grounding')).ok === true);
const distributionPayload = {
  action: 'REVENUE_DISTRIBUTION',
  hasFederation: true,
  federationSharePercent: 10,
  committeeSharePercent: 60,
  generalSharePercent: 30,
};
const distributionOk = checkFinancialAction(distributionPayload, { stage: 'ENFORCE' });
check('م2: النسب الرسمية 10/60/30 تمر في ENFORCE', distributionOk.blocked.length === 0 && !distributionOk.undetermined.some((item) => item.ruleId === 'FR-GATE-052'));
const csvDistributionPayload = {
  action: 'REVENUE_DISTRIBUTION',
  hasFederation: true,
  federationSharePercent: 10,
  printingSharePercent: 10,
  committeeSharePercent: 50,
  generalSharePercent: 30,
};
const distributionBad = checkFinancialAction(csvDistributionPayload, { stage: 'ENFORCE' });
check('م2: نموذج CSV المنفصل لا يُعامل كتعديل للمادة ويُرفض في فحصها', distributionBad.blocked.some((item) => item.ruleId === 'FR-GATE-052'));
const distributionShadow = checkFinancialAction(csvDistributionPayload, { stage: 'SHADOW' });
check('مرحلة SHADOW ترصد ولا تمنع نسب CSV المخالفة للنص', distributionShadow.blocked.length === 0 && distributionShadow.enforcement?.effects.some((effect) => effect.ruleId === 'FR-GATE-052' && effect.stage === 'SHADOW'));
const ladder = checkFinancialAction({ action: 'PROCUREMENT', entityLevel: 'BRANCH', amount: 150000, procurementMethod: 'DIRECT_ORDER', hasSpecifications: true }, { stage: 'ENFORCE' });
check('م61: أمر مباشر بـ150 ألف يُمنع (السلّم)', ladder.blocked.length > 0);
const certificates = checkFinancialAction({ action: 'CONTRACTOR_CLEARANCES', amount: 50000, hasSocialInsuranceCertificate: false, hasLaborDirectorateCertificate: false, hasStatementOfAccount: true }, { stage: 'ENFORCE' });
check('م73: مستخلص بلا شهادات تأمينات يُمنع', certificates.blocked.some((v) => v.ruleId === 'FR-GATE-053'));

process.stdout.write('\n== 5) النظام الأساسي (69 مادة / 113 قاعدة) ==\n');
const statuteDoc = await get('/api/statute');
check('69 مادة في الوثيقة', statuteDoc.stats.articles === 69, String(statuteDoc.stats.articles));
const coverage = await get('/api/statute/coverage');
check('تغطية 100% من المواد', coverage.coveragePercent === 100, String(coverage.coveragePercent));
check('صفر قاعدة بلا سند مادة', (await get('/api/statute/grounding')).ok === true);
const assembly = checkGovernanceAction({ action: 'CALL_ASSEMBLY', noticeDays: 5, quorumPercent: 60, attendancePercent: 60 }, ['SYSTEM_ADMIN'], 'ENFORCE');
check('إعلان جمعية بـ5 أيام يُمنع (R-GOV-001 — المادة 16)', assembly.blocked.some((v) => v.ruleId === 'R-GOV-001' && v.articleNumber === 16));
const enforcement = await get('/api/statute/enforcement');
check('خطة التفعيل بأربع مراحل', enforcement.stages.length === 4 && Array.isArray(enforcement.plan));
check('الاعتماد مُثبت (6/2018) ودليل المسح موصول', Boolean(statuteDoc.document.ratifiedOn) && Boolean(statuteDoc.document.approvalEvidence));

process.stdout.write('\n== 6) محرك اللائحة الأصلي بعد التصحيح ==\n');
const byId = (id: string) => regulationService.getRule(id);
check('بدل السفر: 2,000 (كان 200)', Number(byId('TRAVEL_ALLOWANCE_DAILY_CAP')?.value) === 2000);
check('بدل السفر للجان: 100 (جديد)', Number(byId('TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH')?.value) === 100);
check('بدل الانتقال الشهري: 3,000 (كان 300)', Number(byId('MONTHLY_TRANSPORT_ALLOWANCE_CAP')?.value) === 3000);
check('بدل الأعباء الشهري: 5,000 (كان 500)', Number(byId('MONTHLY_BURDEN_ALLOWANCE_CAP')?.value) === 5000);
check('استثناء الهدايا المطبوع م50 محفوظ كحد استثنائي 100,000,000', byId('GIFTS_CEILING_EXCEPTIONAL')?.enabled === true && Number(byId('GIFTS_CEILING_EXCEPTIONAL')?.value) === 100_000_000);
check('حد الهدايا النظامي 5,000 نشط', byId('GIFTS_CEILING_REGULAR')?.enabled === true && Number(byId('GIFTS_CEILING_REGULAR')?.value) === 5000);
check('غرامة التأخير منسوبة لم73 مع إبقاء نسبتي 5% منفصلتين في م72', byId('PENALTY_CAP_PCT')?.articleNo === '73' && Number(byId('CONTRACT_WORKS_PROGRESS_PCT')?.value) === 5 && Number(byId('CONTRACT_WORKS_GUARANTEED_REMAINDER_PCT')?.value) === 5);
check('قاعدة نسبة الأعمال 5% (م72)', Number(byId('CONTRACT_WORKS_PROGRESS_PCT')?.value) === 5);
check('قاعدة مواد التشوينات 75% (م72)', Number(byId('CONTRACT_MATERIALS_SUPPLY_PCT')?.value) === 75);
check('قاعدة شهادات المقاول م73 نشطة', byId('CONTRACTOR_CLEARANCE_REQUIRED')?.enabled === true && byId('CONTRACTOR_CLEARANCE_REQUIRED')?.articleNo === '73');
check('نسبة 95% القديمة غير معرّفة', REGULATION_ACTIVATED_RULES.every((r) => !(r.ruleId === 'CONTRACT_PROGRESS_PAYMENT_PCT' && r.value === 95)));

const travelViolation = regulationService.checkJournalEntry({
  totalDebit: 500,
  linesCount: 1,
  entityLevel: 'GENERAL_UNION',
  lines: [{ accountCode: '1101', description: 'بدل سفر', travelNights: 1, debit: 500, credit: 0 }],
});
check('م37: بدل سفر 500 يُنبَّه (أقل من الحد الأدنى 2,000)', travelViolation.some((v) => v.ruleId === 'TRAVEL_ALLOWANCE_DAILY_CAP'));
const transportViolation = regulationService.checkJournalEntry({
  totalDebit: 3500,
  linesCount: 1,
  lines: [{ accountCode: '1101', description: 'بدل انتقال شهري', debit: 3500, credit: 0 }],
});
check('م39: بدل انتقال 3,500 يُنبَّه (فوق 3,000)', transportViolation.some((v) => v.ruleId === 'MONTHLY_TRANSPORT_ALLOWANCE_CAP'));
const burdenViolation = regulationService.checkJournalEntry({
  totalDebit: 6000,
  linesCount: 1,
  lines: [{ accountCode: '1101', description: 'بدل أعباء شهري', boardMember: false, debit: 6000, credit: 0 }],
});
check('م40: بدل أعباء 6,000 يُنبَّه (فوق 5,000)', burdenViolation.some((v) => v.ruleId === 'MONTHLY_BURDEN_ALLOWANCE_CAP'));
const giftViolation = regulationService.checkJournalEntry({
  totalDebit: 6000,
  linesCount: 1,
  lines: [{ accountCode: '1101', description: 'هدايا وفود أجنبية', debit: 6000, credit: 0 }],
});
check('م50: هدايا 6,000 تُنبَّه بالحد النظامي 5,000', giftViolation.some((v) => v.ruleId === 'GIFTS_CEILING_REGULAR'));
const distributionPass = regulationService.checkDistributionPercentages([
  { beneficiaryOrgId: 'org-general', percentage: 30 },
  { beneficiaryOrgId: 'org-federation', percentage: 10 },
  { beneficiaryOrgId: 'org-prof-committee', percentage: 60 },
]);
check('م2: التوزيع الرسمي 10% اتحاد + 60% لجنة + 30% نقابة يمر', distributionPass.length === 0, JSON.stringify(distributionPass));
const distributionFail = regulationService.checkDistributionPercentages([
  { beneficiaryOrgId: 'org-general', percentage: 30 },
  { beneficiaryOrgId: 'org-printing', percentage: 10 },
  { beneficiaryOrgId: 'org-federation', percentage: 10 },
  { beneficiaryOrgId: 'org-prof-committee', percentage: 50 },
]);
check('م2: نموذج CSV المرجعي لا يُمرر كقاعدة قانونية', distributionFail.length > 0);

process.stdout.write('\n== 7) صفحة الوحدة ومَسار الدعم ==\n');
const state = await get('/api/statutory/state');
check('حالة الواجهة تحمل الوحدات الثلاث', state.stats.articles === 69 && state.financial.stats.rules === 90 && state.accounting.stats.accounts === 118);
const defaults = await get('/api/statutory/defaults');
check('حمولات المحاكيات جاهزة (حكامة وعضوية)', Boolean(defaults.governance) && Boolean(defaults.membership));
const page = await fetch(`${base}/statutory`);
const html = await page.text();
check(
  'مسار /statutory يوجّه إلى غلاف SPA وتبويب الوحدة المدمجة',
  page.ok && html.includes('<div id="root"') && new URL(page.url).searchParams.get('tab') === 'statutory',
  `${page.url} — ${html.length} حرفاً`,
);
check('المسار يعيد غلاف SPA لا صفحة مستقلة خارج تدفق الجلسة', html.includes('/src/main.tsx') && !html.includes('/api/statutory-ui'));

process.stdout.write('\n== 8) CSV مرجعي مستقل عن اللائحة والإيصالات + نبرة المساعدين ==\n');
const distribution = await get('/api/revenue-distribution/final');
check('26 لجنة نقابية مهنية من ملف المستخدم', distribution.committees.length === 26 && distribution.document.stats.committees === 26, String(distribution.committees.length));
check('52 مكتب شئون عضوية من ملف المستخدم', distribution.offices.length === 52 && distribution.document.stats.offices === 52, String(distribution.offices.length));
const shebin = distribution.committees.find((c: any) => c.nameAr.includes('شبين الكوم'));
check(
  'شبين الكوم: 1,000 إيصال × 40 = 40,000.00 بالتفصيل الملف (10,500/5,000/3,500/3,500/17,500)',
  Boolean(shebin) &&
    shebin.receiptsCount === 1000 &&
    shebin.tier === 40 &&
    shebin.totalCollected === 40000 &&
    shebin.generalShare30 === 10500 &&
    shebin.educationSupportFull === 5000 &&
    shebin.printingShare10 === 3500 &&
    shebin.federationShare10 === 3500 &&
    shebin.committeeShare === 17500,
  JSON.stringify(shebin ?? null),
);
check(
  'إجمالي اللجان 40,000.00 وسطر الإجمالي المطبوعة بالملف فارغ لعمود الاتحاد (3,500 محسوباً)',
  distribution.committeeTotals.totalCollected === 40000 && distribution.committeeTotals.federationShare10 === 3500,
  JSON.stringify(distribution.committeeTotals.federationShare10),
);
check('التفقيط من الملف: فقط 40 ألفاً جنيهاً لا غير', distribution.document.provenance.tafqeetAr.includes('40'), distribution.document.provenance.tafqeetAr);
const pct = distribution.percentages.map((x: any) => `${x.labelAr}=${x.percent}`);
check(
  'النسب من رؤوس الملف: النقابة 30% • مطبوعات 10% • الاتحاد 10% • اللجنة 50% + دعم التثقيف كامل',
  pct.join(' | ') ===
    'حصة النقابة العامة=30 | مطبوعات=10 | حصة الاتحاد العام=10 | حصة اللجنة=50 | دعم التثقيف كامل=100',
  pct.join(' | '),
);
const suez = distribution.offices.find((o: any) => o.nameAr.includes('السويس'));
check(
  'السويس: 1,000 إيصال فئة 43 «من 6001 إلى 7000» = 43,000.00',
  Boolean(suez) && suez.receiptValue === 43 && suez.receiptsCount === 1000 && suez.totalRevenue === 43000 && suez.receiptRangeAr.includes('6001'),
  JSON.stringify(suez ?? null),
);
check('إجمالي إيرادات المكاتب 43,000.00', distribution.officeTotals.totalRevenue === 43000, String(distribution.officeTotals.totalRevenue));
check(
  'بصمة الملفين مسجّلة في العرض (تتبّع المصدر)',
  distribution.document.provenance.committeesSha256.length === 64 && distribution.document.provenance.officesSha256.length === 64,
);
check(
  'تعارض المصدرين DIST-OPEN-001 معلن وغير محسوم بلا اعتماد قانوني (OPEN)',
  distribution.openItems.length === 1 && distribution.openItems[0].id === 'DIST-OPEN-001' && distribution.openItems[0].status === 'PENDING',
  JSON.stringify(distribution.openItems.map((o: any) => `${o.id}:${o.status}`)),
);
const article2 = (await get('/api/regulations/search?sourceId=src-financial&q=توزيع حصيلة الاشتراكات')).documents?.[0];
check(
  'المادة (2) في مصدر اللائحة تحفظ النسب الرسمية 10/60/30 ولا تتضمن بند المطبوعات',
  Boolean(article2) &&
    article2.textAr.includes('60% للجنة النقابية') &&
    article2.textAr.includes('30% للنقابة العامة') &&
    article2.textAr.includes('10% من إجمالي الاشتراكات إلى الاتحاد النقابي') &&
    !article2.textAr.includes('10% للمطبوعات'),
  article2 ? article2.textAr.slice(0, 80) : 'لم تُوجد المادة',
);
check(
  'سطور قاعدة التوزيع المعتمدة تجمع 100% على الاشتراكات',
  distribution.percentages.filter((x: any) => x.id !== 'pct-education').reduce((s: number, x: any) => s + x.percent, 0) === 100,
);

const storeSource = fs.readFileSync(path.join(root, 'server', 'db', 'store.ts'), 'utf8');
check(
  'قواعد الإيصالات التشغيلية DIST-MEMB-V1 وDIST-CERT-V1 بقيت مستقلة عن ملف CSV',
  storeSource.includes('DIST-MEMB-V1') && storeSource.includes('DIST-CERT-V1') && !storeSource.includes('FINAL_DISTRIBUTION_RULE'),
);
const finalSource = fs.readFileSync(path.join(root, 'server', 'data', 'revenue-distribution-final.ts'), 'utf8');
check(
  'البيانات المدرجة تحمل مصدرها وبصمة الملفين داخل الكود',
  finalSource.includes('نسب توزيع اللجان المهنية نهائى.csv') && finalSource.includes('المكاتب ايرادات ومصروفات.csv') && finalSource.includes('committeesSha256'),
);
const csvDir = path.join(root, 'server', 'data', 'csv');
check(
  'نسخة الملفين محفوظة داخل البرنامج (server/data/csv) للمراجعة',
  fs.existsSync(path.join(csvDir, 'نسب توزيع اللجان المهنية نهائى.csv')) && fs.existsSync(path.join(csvDir, 'المكاتب ايرادات ومصروفات.csv')),
);

const toneSource = fs.readFileSync(path.join(root, 'server', 'services', 'tone.service.ts'), 'utf8');
const toneConsumers = [
  fs.readFileSync(path.join(root, 'server', 'services', 'general-assistant.service.ts'), 'utf8'),
  fs.readFileSync(path.join(root, 'server', 'services', 'regulation-chat.service.ts'), 'utf8'),
];
check(
  'طبقة نبرة موحّدة مُعرّفة ومستخدمة في المساعد العام ومساعد اللوائح',
  toneSource.includes('TONE_RULES') && toneSource.includes('humanizeReply') && toneConsumers.every((source) => source.includes('humanizeReply')),
);
check(
  'قواعد النبرة تمنع التعريف الروبوتي والمقدمات والحشو الآلي',
  toneSource.includes('BANNED_TONE_PATTERNS') && toneSource.includes('بصفتي') && toneSource.includes('كمساعد ذكي') && toneSource.includes('findToneViolations'),
);
const screens = ['src/pages/AccountingChat.tsx', 'src/pages/AIAssistant.tsx', 'src/components/JournalAiAssistant.tsx', 'src/pages/ModelsViewer.tsx', 'src/components/CustomAgentStudio.tsx'];
const screenText = screens.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
check(
  'شاشات المحادثة بلا تعريف روبوتي أو عبارة افتتاحية آلية',
  !/روبوت محادثة|بصفتي \*\*|كمساعد ذكي|بناءً على طلبك/.test(screenText),
);
check('واجهات المحادثة تستخدم ترحيباً أو دعوة طبيعية للسؤال', /أهلاً بيك|ابدأ بسؤالك|ابدأ المحادثة|قول لي|اسألني/.test(screenText));

process.stdout.write('\n== 9) قاعدة بيانات اللوائح ومساعد اللوائح (شات بوت) ==\n');
const regOverview = await get('/api/regulations/overview');
check(
  'ثلاثة مصادر تشريعية مُدرجة في القاعدة (النظام الأساسي • المالية • التنفيذية 35/2018)',
  regOverview.stats?.sources === 3 && regOverview.sources?.length === 3,
  JSON.stringify(regOverview.sources?.map((s: any) => s.code)),
);
check(
  'بنود القاعدة: 69 مادة نظام أساسي + 17 مادة مالية + 29 بنداً للّائحة التنفيذية = 115',
  regOverview.stats?.statuteArticles === 69 &&
    regOverview.stats?.financialArticles === 17 &&
    regOverview.stats?.law35Chunks === 29 &&
    regOverview.stats?.documents === 115,
  JSON.stringify(regOverview.stats),
);
check(
  'المصادر مُخزَّنة فعلاً في قاعدة بيانات البرنامج (memory/SQL) لا كملفات متناثرة',
  regOverview.inDatabase?.sources === 3 && regOverview.inDatabase?.documents === 115,
  JSON.stringify(regOverview.inDatabase),
);
check(
  'الملف المرفق مُدرج كمصدر ببصمته وصفحاته وحدود أمانته معلنة',
  (regOverview.sources ?? []).some((s: any) => s.code === 'LAW35-2018' && s.hasTextLayer === false && s.sha256?.length === 64 && s.pagesCount === 17) &&
    typeof regOverview.law35LimitationAr === 'string' &&
    regOverview.law35LimitationAr.includes('OCR'),
);
check('صور صفحات الملف المرفق (17) معلنة للعرض', regOverview.law35Pages?.length === 17);

const law35Page = await fetch(`${base}/api/regulations/law35/pages/3`);
check('صورة صفحة من الملف المرفق تُخدَم من الخادم (image/jpeg)', law35Page.ok && (law35Page.headers.get('content-type') ?? '').includes('image'));
const law35File = await fetch(`${base}/api/regulations/law35/file`);
check('أصل الـPDF المرفق متاح من الخادم (application/pdf)', law35File.ok && (law35File.headers.get('content-type') ?? '').includes('pdf'));

const chatArticle2 = await post('/api/regulations/chat', { question: 'إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟' });
check(
  'الشات بوت: سؤال عن المادة (2) يُجاب بالنص من قاعدة اللوائح مع سنده',
  chatArticle2.origin === 'ARTICLE_EXACT' &&
    chatArticle2.answerAr.includes('60% للجنة النقابية') &&
    chatArticle2.citations?.[0]?.refCode?.includes('2') &&
    chatArticle2.citations?.[0]?.sourceCode === 'FINANCIAL',
  chatArticle2.origin,
);
const chatTopic = await post('/api/regulations/chat', { question: 'سقف الصرف النقدي كام؟' });
check(
  'الشات بوت: سؤال موضوعي يرجع نصوصاً من اللوائح مع مراجعها',
  chatTopic.citations?.length >= 1 && chatTopic.answerAr.length > 60,
  `${chatTopic.origin} — ${chatTopic.citations?.length} مرجعاً`,
);
const chatStatute = await post('/api/regulations/chat', { question: 'المادة 12 من لائحة النظام الأساسي' });
check(
  'الشات بوت: يستدعي مادة من لائحة النظام الأساسي بنصها',
  chatStatute.origin === 'ARTICLE_EXACT' && chatStatute.citations?.[0]?.sourceCode === 'STATUTE',
  chatStatute.origin,
);
const chatLaw35 = await post('/api/regulations/chat', { question: 'إيه اللي في اللائحة التنفيذية لقانون المنظمات النقابية؟' });
check(
  'الشات بوت: يجيب من الملف المرفق ويعلن حدوده (نص OCR يحتاج مراجعة)',
  chatLaw35.citations?.some((c: any) => c.sourceCode === 'LAW35-2018') && Boolean(chatLaw35.limitationAr),
  `${chatLaw35.origin} — ${chatLaw35.citations?.length} مرجعاً`,
);
const chatFinancialNamed = await post('/api/regulations/chat', { question: 'إيه نص المادة 2 من اللائحة المالية؟' });
check(
  'الشات بوت: تسمية اللائحة المالية في السؤال توجّه الإجابة لمصدرها (لا لمادة بنفس الرقم في مصدر آخر)',
  chatFinancialNamed.origin === 'ARTICLE_EXACT' &&
    chatFinancialNamed.citations?.[0]?.sourceCode === 'FINANCIAL' &&
    chatFinancialNamed.answerAr.includes('60% للجنة النقابية'),
  `${chatFinancialNamed.citations?.[0]?.sourceCode} — ${chatFinancialNamed.citations?.[0]?.refCode}`,
);
const chatStatuteNamed = await post('/api/regulations/chat', { question: 'إيه نص المادة 2 من لائحة النظام الأساسي؟' });
check(
  'الشات بوت: تسمية لائحة النظام الأساسي توجّه الإجابة لمصدرها',
  chatStatuteNamed.origin === 'ARTICLE_EXACT' && chatStatuteNamed.citations?.[0]?.sourceCode === 'STATUTE',
  `${chatStatuteNamed.citations?.[0]?.sourceCode} — ${chatStatuteNamed.citations?.[0]?.refCode}`,
);
const chatWrongSource = await post('/api/regulations/chat', { question: 'إيه نص المادة 5 من اللائحة الت  فيذية لقانون المنظمات النقابية؟' });
check(
  'الشات بوت: لو الرقم غير موجود في المصدر المطلوب يعلن ذلك صراحة ويعرض البديل (لا يخترع مادة)',
  chatWrongSource.origin === 'ARTICLE_EXACT' && /مفيش مادة بالرقم/.test(chatWrongSource.answerAr),
  chatWrongSource.answerAr.split('\n')[0].slice(0, 60),
);

const chatOverview = await get('/api/regulations/overview');
check('الشات بوت: يعرض المصادر والاقتراحات عند السؤال العام', chatOverview.sources?.length === 3);

const searchArticle = await get('/api/regulations/search?q=60%25');
check(
  'البحث في قاعدة اللوائح يجد المادة (2) المحدَّثة',
  (searchArticle.documents ?? []).some((d: any) => d.sourceId === 'src-financial' && d.textAr.includes('60% للجنة النقابية')),
  String(searchArticle.count),
);
const searchLaw35 = await get('/api/regulations/search?sourceId=src-law35&limit=40');
check('البحث داخل الملف المرفق يعمل ويعرض كل بنوده (29)', searchLaw35.documents?.length === 29 && searchLaw35.documents.every((d: any) => d.sourceId === 'src-law35'));
check(
  'مقاطع الملف المرفق معلَّمة بأنها من OCR والدِّيباجة بالنص المقروء (شفافية المصدر)',
  (searchLaw35.documents ?? []).filter((d: any) => d.kindAr === 'مقطع من صورة الصفحة').every((d: any) => d.ocrDerived === true) &&
    (searchLaw35.documents ?? []).filter((d: any) => d.kindAr === 'ديباجة').every((d: any) => d.ocrDerived !== true) &&
    (searchLaw35.documents ?? []).filter((d: any) => d.ocrDerived === true).length === 24,
);

process.stdout.write('\n== 10) واجهة شاشة اللوائح ومساعد اللوائح (شات بوت) ==\n');
const readSrc = (rel: string) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : '');

const chatUi = readSrc('src/pages/RegulationChat.tsx');
const libraryUi = readSrc('src/pages/RegulationLibrary.tsx');
const hubUi = readSrc('src/pages/RegulationBudgetsHub.tsx');
const portalsUi = readSrc('src/config/portals.ts');
const layoutUi = readSrc('src/components/Layout.tsx');
const appUi = readSrc('src/App.tsx');
const apiUi = readSrc('src/services/api.ts');
const statutoryHubUi = readSrc('src/pages/StatutoryHub.tsx');
const statutoryBoardsUi = [
  'src/features/statutory/StatuteBoard.tsx',
  'src/features/statutory/FinancialRulesBoard.tsx',
  'src/features/statutory/AccountingCoreBoard.tsx',
  'src/features/statutory/StatutoryCheckBoard.tsx',
].map(readSrc).join('\n');

check(
  'النظام الأساسي والمالية والنواة المحاسبية موصولة بلوحة SPA والتنقل الفعلي',
  appUi.includes("lazy(() => import('./pages/StatutoryHub.js')") &&
    appUi.includes("currentTab === 'statutory'") &&
    appUi.includes("get('tab') === 'statutory'") &&
    layoutUi.includes("id: 'statutory'") &&
    statutoryHubUi.includes('StatuteBoard') &&
    statutoryHubUi.includes('FinancialRulesBoard') &&
    statutoryHubUi.includes('AccountingCoreBoard') &&
    statutoryBoardsUi.includes('statutoryApi.'),
);
check(
  'شاشتا اللوائح والمساعد مبنيّتان داخل البرنامج',
  libraryUi.length > 2000 && chatUi.length > 2000 && libraryUi.includes('data-assistant-screen="regulation-library"') && chatUi.includes('data-assistant-screen="regulation-chat"'),
  `مكتبة ${libraryUi.length} حرفاً • مساعد ${chatUi.length} حرفاً`,
);
check(
  'الشاشتان مُسجَّلتان في سجل شاشات البوابات (3 بوابات/بوابتان)',
  portalsUi.includes("id: 'regulations-library'") && portalsUi.includes("id: 'regulation-assistant'"),
);
check(
  'وحدة «الرقابة المالية والموازنات» تضم التبويبين الجديدين (Layout + Hub + App)',
  layoutUi.includes("'regulations-library', 'regulation-assistant'") &&
    hubUi.includes("'regulations-library'") &&
    hubUi.includes("'regulation-assistant'") &&
    appUi.includes("'regulations-library': 'regulations-library'") &&
    appUi.includes("'regulation-assistant': 'regulation-assistant'"),
);
check(
  'الربط الثنائي: سؤال من المكتبة ← المساعد، وبند من المساعد ← المكتبة',
  hubUi.includes('openAssistantWith') &&
    hubUi.includes('onAskAssistant={openAssistantWith}') &&
    hubUi.includes('onOpenDocument={openLibraryDocument}') &&
    libraryUi.includes('onAskAssistant') &&
    chatUi.includes('onOpenDocument'),
);
check(
  'شاشة اللوائح تعرض المصادر الثلاثة وصور صفحات المرفق ورابط PDF الأصلي',
  /library\??\.sources/.test(libraryUi) &&
    libraryUi.includes('/api/regulations/law35/pages/') &&
    (libraryUi.includes('/api/regulations/law35/file') || chatUi.includes('/api/regulations/law35/file')),
);
check(
  'المساعد يستدعي POST /api/regulations/chat ويعرض الاستشهادات وحدود OCR',
  apiUi.includes("'/api/regulations/chat'") &&
    chatUi.includes('citations') &&
    chatUi.includes('limitationAr') &&
    chatUi.includes('OCR'),
);
check(
  'نبرة الواجهة الجديدة محادثة طبيعية بلا عبارات آلية',
  !/بصفتي|كمساعد ذكي|روبوت محادثة|أنا نموذج/.test(chatUi + libraryUi),
);
check(
  'رقم الصفحة (pageNumber) مُدرج في النوع والبيانات والمخطط والمزامنة',
  readSrc('src/types/erp.regulations.ts').includes('pageNumber') &&
    readSrc('server/data/regulations-library.ts').includes('pageNumber: chunk.page') &&
    readSrc('src/db/schema.ts').includes("integer('page_number')") &&
    readSrc('server/db/pg-schema.sql').includes('"page_number" integer') &&
    readSrc('server/db/postgresSync.ts').includes('pageNumber: document.pageNumber ?? null'),
);
const postgresSyncSource = readSrc('server/db/postgresSync.ts');
check(
  'بذر/مزامنة اللوائح تُنفّذ قبل مساري قاعدة جديدة أو قائمة وتستعيد 3 مصادر و115 بنداً',
  (postgresSyncSource.match(/await this\.seedRegulations\(store\)/g) ?? []).length === 1 &&
    /private async seedRegulations\(store: ERPStore\): Promise<void>/.test(postgresSyncSource) &&
    postgresSyncSource.includes('pageNumber: document.pageNumber ?? null') &&
    postgresSyncSource.includes('ocrDerived: Boolean(document.ocrDerived)') &&
    postgresSyncSource.includes('db.select().from(schema.regulationSources)') &&
    postgresSyncSource.includes('db.select().from(schema.regulationDocuments)'),
);
check(
  'مزامنة اللوائح تمنع التكرار عبر upsert ولا تمسح مصادر أو بنوداً',
  (postgresSyncSource.match(/onConflictDoUpdate/g) ?? []).length >= 2 &&
    !/delete\(schema\.regulationDocuments|TRUNCATE/i.test(postgresSyncSource),
);
check(
  'الشاشتان بلا روابط خارجية (تعملان داخل الحزمة بلا شبكة)',
  !/https?:\/\/(?!localhost)/.test(chatUi + libraryUi),
);

server.close();
process.stdout.write(`\nالنتيجة: ${passed} ناجح / ${failed} فاشل\n`);
process.exit(failed === 0 ? 0 : 1);
