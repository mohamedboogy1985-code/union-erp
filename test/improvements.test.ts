import assert from 'assert';
import { erpStore } from '../server/db/store.js';
import { accountingService } from '../server/services/accounting.service.js';
import { advancedVoiceProcessor, extractArabicAmount, convertArabicDigits } from '../server/services/voice.processor.js';
import { enhancedOCRService } from '../server/services/ocr.service.js';
import { smartAgentEnhancer } from '../server/services/smart-agent.service.js';
import { accountQueryService } from '../server/services/account-query.service.js';
import { advancedAuthService } from '../server/services/auth-advanced.service.js';
import { encryptionService } from '../src/services/encryption.service.js';
import { paginationService } from '../server/utils/pagination.js';
import { CachingStrategy } from '../server/services/cache.service.js';
import { dashboardService } from '../server/services/dashboard.service.js';
import { generateTotpSecret, verifyTotp, generateTotp } from '../server/utils/totp.js';
import { KNOWLEDGE_BASE } from '../server/data/knowledge-base.js';

console.log('🧪 Starting IMPROVEMENTS.md Features Test Suite...\n');

async function runTests() {
  const accountantUser = erpStore.users[2];
  const cfoUser = erpStore.users[1];

  // -------------------------------------------------------------
  // Test 1: Voice Processor - استخراج المبالغ (أرقام هندية + كلمات عربية)
  // -------------------------------------------------------------
  console.log('🔹 Test 1: Voice Amount Extraction (digits, Hindi digits, Arabic words)');
  assert.strictEqual(convertArabicDigits('١٥٠٠'), '1500');
  assert.strictEqual(extractArabicAmount('مصروفات بقيمة 1500 جنيه')?.amount, 1500);
  assert.strictEqual(extractArabicAmount('صيانة بـ ٢٥٠٠٠ ج.م')?.amount, 25000);
  assert.strictEqual(extractArabicAmount('قيمة الفاتورة 51,300.00 جنيه')?.amount, 51300);
  assert.strictEqual(extractArabicAmount('ألف وخمسمئة جنيه')?.amount, 1500);
  assert.strictEqual(extractArabicAmount('خمسة آلاف جنيه')?.amount, 5000);
  assert.strictEqual(extractArabicAmount('صيانة بخمسة آلاف جنيه')?.amount, 5000, 'حروف الجر (بـ) يجب ألا تكسر قراءة العدد');
  assert.strictEqual(extractArabicAmount('مليونين جنيه')?.amount, 2000000);
  console.log('  ✅ Passed: Arabic/Hindi digits and compound number words parsed correctly.');

  // -------------------------------------------------------------
  // Test 2: Voice Intention + Balanced Entry + Confirmation threshold
  // -------------------------------------------------------------
  console.log('\n🔹 Test 2: Voice Intention Parsing & Balanced Entry Generation');
  const intention = advancedVoiceProcessor.parseVoiceIntention(
    'تسجيل قيد مصروفات صيانة بقيمة 1500 جنيه بشيك من بنك مصر'
  );
  assert.strictEqual(intention.intent, 'EXPENSE');
  assert.strictEqual(intention.amount, 1500);
  assert.strictEqual(intention.paymentMethod, 'CHEQUE');
  assert.strictEqual(intention.category, 'صيانة');
  assert.strictEqual(intention.matchedTemplateId, 'tpl-maintenance');

  const balanced = advancedVoiceProcessor.generateBalancedEntry(intention);
  const totalDebit = balanced.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = balanced.lines.reduce((s, l) => s + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
  assert.strictEqual(totalDebit, 1500);
  assert.strictEqual(balanced.lines[1].accountCode, '1103', 'يجب الصرف من بنك مصر (1103)');
  assert.strictEqual(balanced.requiresConfirmation, false, 'المبالغ الصغيرة لا تحتاج تأكيداً');

  // قيد كبير يتطلب تأكيداً (فوق الحد 50000)
  const bigIntention = advancedVoiceProcessor.parseVoiceIntention('مصروفات توريدات بقيمة 90000 جنيه نقداً');
  assert.strictEqual(bigIntention.requiresConfirmation, true);
  console.log('  ✅ Passed: intent, template matching, bank detection, balancing and confirmation threshold.');

  // -------------------------------------------------------------
  // Test 3: OCR Intelligent Extraction + Account Suggestions
  // -------------------------------------------------------------
  console.log('\n🔹 Test 3: OCR Extraction & Account Suggestion (invoice/receipt/cheque)');
  const invoiceText = `فاتورة رقم INV-2026-9041
شركة الأمل للمقاولات والتوريدات
الرقم الضريبي: 102-394-881
التاريخ: 2026-02-15
بيان: توريد مستلزمات وصيانة أجهزة مكتبية
الإجمالي: 51,300.00
ضريبة: 6,300.00`;

  const extracted = enhancedOCRService.extractIntelligentData(invoiceText);
  assert.strictEqual(extracted.documentType, 'INVOICE');
  assert.strictEqual(extracted.amount, 51300);
  assert.strictEqual(extracted.date, '2026-02-15');
  assert.strictEqual(extracted.invoiceNumber, 'INV-2026-9041');

  const suggestions = enhancedOCRService.suggestAccounts(extracted);
  const debit = suggestions.find((s) => s.type === 'DEBIT');
  const credit = suggestions.find((s) => s.type === 'CREDIT');
  assert.ok(debit, 'يجب اقتراح حساب مدين');
  assert.ok(credit, 'يجب اقتراح حساب دائن');
  assert.strictEqual(credit.accountCode, '2101', 'الفاتورة يجب أن تُقيد على الدائنين 2101');
  assert.ok(debit.confidence >= 0.6);

  const draft = enhancedOCRService.buildBalancedDraftEntry(extracted, suggestions);
  assert.ok(draft?.balanced, 'مسودة القيد يجب أن تكون متوازنة');
  const draftDebit = draft!.lines.reduce((s, l) => s + l.debit, 0);
  assert.strictEqual(draftDebit, 51300);

  // إيصال نقدي
  const receiptText = 'إيصال قبض رقم RC-77\nتحصيل اشتراكات عضوية سنوية\nالمبلغ: 3000\nالتاريخ: 15/02/2026';
  const receiptExtracted = enhancedOCRService.extractIntelligentData(receiptText);
  assert.strictEqual(receiptExtracted.documentType, 'RECEIPT');
  assert.strictEqual(receiptExtracted.date, '2026-02-15');
  const receiptSuggestions = enhancedOCRService.suggestAccounts(receiptExtracted);
  assert.strictEqual(receiptSuggestions.find((s) => s.type === 'CREDIT')?.accountCode, '1101');
  console.log('  ✅ Passed: document typing, amounts, dates, and chart-of-accounts linking with confidence.');

  // -------------------------------------------------------------
  // Test 4: Smart Agent - تصنيف الأسئلة + قاعدة المعرفة + بيانات 1301
  // -------------------------------------------------------------
  console.log('\n🔹 Test 4: Smart Agent (classification, knowledge base, live 1301 data)');
  assert.strictEqual(smartAgentEnhancer.classifyQuestion('ما رصيد حساب 1301 الآن؟'), 'ACCOUNT_INQUIRY');
  assert.strictEqual(smartAgentEnhancer.classifyQuestion('ما القواعد المنظمة للاشتراكات؟'), 'REGULATION');
  assert.strictEqual(smartAgentEnhancer.classifyQuestion('يظهر لي خطأ القيد غير متوازن'), 'TECHNICAL_SUPPORT');

  const answer1301 = smartAgentEnhancer.handleComplexQueries('ما رصيد المدينين في 1301 ومن أكبر المدينين؟');
  assert.ok(answer1301.answer.includes('1301'), 'الإجابة يجب أن تتضمن رصيد 1301');
  assert.ok(answer1301.dataContext?.account1301, 'يجب ربط بيانات الحساب الحية');
  assert.ok(answer1301.sources.some((s) => s.type === 'DATABASE'));

  const errorAnswer = smartAgentEnhancer.handleComplexQueries('يرفض النظام القيد برسالة القيد غير متوازن');
  assert.ok(errorAnswer.sources.some((s) => s.type === 'COMMON_ERROR'), 'يجب ربط الخطأ الشائع');
  assert.ok(KNOWLEDGE_BASE.faqItems.length >= 5 && KNOWLEDGE_BASE.accountingRules.length >= 5);
  console.log('  ✅ Passed: question classification + KB matching + live data linking.');

  // -------------------------------------------------------------
  // Test 5: Account Query Service (2.2)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 5: Account Query Service (1301 balance, receipts, pending)');
  const info = accountQueryService.getAccount1301Balance();
  assert.strictEqual(info.accountCode, '1301');
  assert.ok(info.partiesCount >= 3);
  assert.ok(info.topDebtors.length >= 1);
  assert.ok(info.recentTransactions.length >= 1);

  const latest = accountQueryService.getLatestReceipts(undefined, 5);
  assert.ok(latest.length >= 1);
  assert.ok(latest[0].receiptNumber.startsWith('RC-'));

  // إنشاء قيد جديد (مسودة) ثم التحقق من ظهوره في المعلق
  const { entry: draftEntry } = accountingService.createJournalEntry(
    {
      date: '2026-02-25',
      organizationId: 'org-general',
      description: 'اختبار القيود المعلقة',
      lines: [
        { accountId: 'acc-1101', debit: 1000, credit: 0, description: 'نقدية' },
        { accountId: 'acc-4101', debit: 0, credit: 1000, description: 'إيراد' },
      ],
      userId: accountantUser.id,
    },
    accountantUser
  );
  const pending = accountQueryService.getPendingEntries();
  assert.ok(pending.count >= 1);
  assert.ok(pending.entries.some((e) => e.entryId === draftEntry.id));
  console.log('  ✅ Passed: live 1301 balance, latest receipts, and pending entries analysis.');

  // -------------------------------------------------------------
  // Test 6: Accounting History (1.1) - تسجيل تغير الأرصدة عند الترحيل
  // -------------------------------------------------------------
  console.log('\n🔹 Test 6: Accounting History recorded on posting');
  const historyCountBefore = erpStore.accountingHistory.length;
  draftEntry.status = 'APPROVED';
  accountingService.postJournalEntry(draftEntry.id, cfoUser);
  assert.ok(erpStore.accountingHistory.length >= historyCountBefore + 2, 'يجب تسجيل تغير كل حساب في القيد');
  const cashHistory = erpStore.accountingHistory.find(
    (h) => h.accountCode === '1101' && h.journalEntryId === draftEntry.id
  );
  assert.ok(cashHistory, 'يجب وجود سجل لحساب الخزينة');
  assert.strictEqual(cashHistory!.changeAmount, 1000);
  assert.strictEqual(cashHistory!.currentBalance, cashHistory!.previousBalance + 1000);
  console.log('  ✅ Passed: balance-change history captured per account per posting.');

  // -------------------------------------------------------------
  // Test 7: Journal Templates (1.1) + إنشاء قيد من قالب
  // -------------------------------------------------------------
  console.log('\n🔹 Test 7: Journal Templates & template-based entry');
  assert.ok(erpStore.journalTemplates.length >= 5);
  const tpl = smartAgentEnhancer.matchJournalTemplate('سداد رواتب الموظفين لهذا الشهر');
  assert.strictEqual(tpl?.id, 'tpl-salary');
  const tplResult = accountingService.createJournalEntry(
    {
      date: '2026-02-25',
      organizationId: 'org-general',
      description: `قيد من قالب ${tpl!.nameAr}`,
      type: 'MANUAL',
      lines: [
        { accountId: erpStore.accounts.find((a) => a.code === '5101')!.id, debit: 5000, credit: 0, description: tpl!.nameAr },
        {
          accountId: erpStore.accounts.find((a) => a.code === '1102')!.id,
          subledgerPartyNameInput: 'البنك الأهلي المصري - الحساب الجاري الرئيسي',
          debit: 0,
          credit: 5000,
          description: tpl!.nameAr,
        },
      ],
      userId: accountantUser.id,
    },
    accountantUser
  );
  assert.strictEqual(tplResult.entry.totalDebit, 5000);
  console.log('  ✅ Passed: templates seeded, matched by keywords, and template entries balance.');

  // -------------------------------------------------------------
  // Test 8: Encryption Service (AES-256-GCM)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 8: AES-256-GCM encryption roundtrip');
  const secret = '29803011204567'; // رقم قومي تجريبي
  const encrypted = encryptionService.encrypt(secret);
  assert.notStrictEqual(encrypted, secret);
  assert.strictEqual(encryptionService.decrypt(encrypted), secret);
  assert.ok(encryptionService.verifyHash('data', encryptionService.hash('data')));
  console.log('  ✅ Passed: sensitive data encrypts/decrypts with authenticated encryption.');

  // -------------------------------------------------------------
  // Test 9: TOTP 2FA (RFC 6238)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 9: TOTP two-factor generation & verification');
  const totpSecret = generateTotpSecret();
  const code = generateTotp(totpSecret);
  assert.strictEqual(code.length, 6);
  assert.strictEqual(verifyTotp(code, totpSecret), true);
  assert.strictEqual(verifyTotp('000000', totpSecret) === false || code === '000000', true);
  console.log('  ✅ Passed: TOTP codes generate and verify within the time window.');

  // -------------------------------------------------------------
  // Test 10: Advanced Auth - lockout بعد 5 محاولات فاشلة
  // -------------------------------------------------------------
  console.log('\n🔹 Test 10: Login lockout after repeated failures');
  const testUser = erpStore.users[3]; // collector
  erpStore.getSecurityState(testUser.id).failedAttempts = 0;
  erpStore.getSecurityState(testUser.id).lockedUntil = undefined;

  // محاولة 2FA خاطئة على حساب غير مفعّل 2FA => تسجل كمحاولة فاشلة (بيانات غير صحيحة)
  for (let i = 0; i < 5; i++) {
    advancedAuthService.loginWithTwoFactor(testUser.username, '111111', '127.0.0.1');
  }
  const blocked = advancedAuthService.loginWithTwoFactor(testUser.username, '111111', '127.0.0.1');
  assert.strictEqual(blocked.success, false);
  assert.ok(blocked.lockedUntil, 'يجب قفل الحساب مؤقتاً');

  // فك القفل ثم اختبار نجاح الدخول وإصدار JWT
  erpStore.getSecurityState(testUser.id).lockedUntil = undefined;
  const loginOk = advancedAuthService.login(testUser.username, '10.0.0.5', 'test-agent');
  assert.strictEqual(loginOk.success, true);
  assert.ok(loginOk.token && loginOk.token.split('.').length === 3, 'يجب إصدار JWT ثلاثي الأجزاء');
  const verified = advancedAuthService.verifyToken(loginOk.token!);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.payload.sub, testUser.id);
  console.log('  ✅ Passed: lockout enforced, JWT issued and verified.');

  // -------------------------------------------------------------
  // Test 11: Cache (7.1) - wrap + expiry + invalidation
  // -------------------------------------------------------------
  console.log('\n🔹 Test 11: Caching strategy (wrap, invalidate, prefix)');
  const cache = new CachingStrategy(1); // TTL ثانية واحدة
  let produced = 0;
  const value1 = await cache.wrap('test:key', () => ++produced);
  const value2 = await cache.wrap('test:key', () => ++produced);
  assert.strictEqual(value1, 1);
  assert.strictEqual(value2, 1, 'يجب جلب القيمة من الكاش دون إعادة الإنتاج');
  await cache.invalidate('test:key');
  const value3 = await cache.wrap('test:key', () => ++produced);
  assert.strictEqual(value3, 2, 'بعد الإبطال يُعاد الإنتاج');
  await cache.set('prefix:a', 1);
  await cache.set('prefix:b', 2);
  await cache.invalidatePrefix('prefix:');
  assert.strictEqual(await cache.get('prefix:a'), null);
  console.log('  ✅ Passed: cache wrap/invalidate/prefix semantics working.');

  // -------------------------------------------------------------
  // Test 12: Pagination (7.2)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 12: Pagination service');
  const sample = Array.from({ length: 55 }, (_, i) => ({ id: i, name: `item-${i}` }));
  const page1 = paginationService.paginate(sample, { page: 1, limit: 20 });
  assert.strictEqual(page1.total, 55);
  assert.strictEqual(page1.totalPages, 3);
  assert.strictEqual(page1.data.length, 20);
  assert.strictEqual(page1.hasNext, true);
  const page3 = paginationService.paginate(sample, { page: 3, limit: 20 });
  assert.strictEqual(page3.data.length, 15);
  assert.strictEqual(page3.hasPrev, true);
  const desc = paginationService.paginate(sample, { page: 1, limit: 5, sortBy: 'id', sortOrder: 'DESC' });
  assert.strictEqual(desc.data[0].id, 54);
  console.log('  ✅ Passed: pagination, totals, and sorting.');

  // -------------------------------------------------------------
  // Test 13: Smart Dashboard (6.1)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 13: Smart Dashboard summary & alerts');
  const summary = await dashboardService.getSmartSummary();
  assert.ok(summary.balanceSummary.totalAssets > 0);
  assert.ok(summary.balanceSummary.debtors1301Total > 0);
  assert.ok(summary.charts.accountDistribution.length >= 4);
  assert.ok(typeof summary.alerts.pendingApprovals === 'number');
  assert.ok(typeof summary.alerts.highRiskDebtors === 'number');
  // الكاش: الاستدعاء الثاني فوري ومن نفس القيم
  const summary2 = await dashboardService.getSmartSummary();
  assert.strictEqual(summary2.generatedAt, summary.generatedAt, 'يجب إرجاع نسخة الكاش نفسها');
  const alerts = await dashboardService.runAlertScan();
  assert.ok(Array.isArray(alerts));
  console.log(`  ✅ Passed: dashboard summary cached & alerts scan ran (${alerts.length} triggered).`);

  // -------------------------------------------------------------
  // Test 14: Feedback learning (2.1)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 14: Learning from user feedback');
  const fb1 = smartAgentEnhancer.learnFromFeedback('ticket-1', 5);
  const fb2 = smartAgentEnhancer.learnFromFeedback('ticket-2', 4);
  assert.strictEqual(fb1.learned, true);
  assert.strictEqual(fb2.feedbackCount, 2);
  assert.strictEqual(fb2.averageRating, 4.5);
  assert.ok(fb2.adjustedConfidence > 0.9, 'التقييمات العالية ترفع ثقة الإجابات');
  assert.throws(() => smartAgentEnhancer.learnFromFeedback('t', 9), /بين 1 و 5/);
  console.log('  ✅ Passed: feedback adjusts agent confidence.');

  console.log('\n🎉 ALL 14 IMPROVEMENTS TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
