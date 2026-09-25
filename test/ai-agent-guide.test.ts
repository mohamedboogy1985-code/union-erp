import test from 'node:test';
import assert from 'node:assert';
import { enhancedOCRService } from '../server/services/ocr.service.js';
import { advancedVoiceProcessor } from '../server/services/voice.processor.js';
import { aiActionsService } from '../server/services/ai-actions.service.js';

test('الخطوة الثانية: نظام التعرف الضوئي (OCR) لإذن الصرف والأوراق المالية', async () => {
  const ocrText = 'إذن صرف رقم 4022\nصرف مبلغ 150000 ج.م\nالبيان: صيانة وإصلاحات لمقر المركز\nالمورد: شركة السلام للتوريدات العامة';

  const result = await enhancedOCRService.processDocument({
    fileName: 'اذن_صرف_اختبار.png',
    rawText: ocrText,
    userId: 'usr-admin',
  });

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.extracted.amount, 150000);
  assert.ok(result.draftEntry);
  assert.strictEqual(result.draftEntry.balanced, true);
  assert.strictEqual(result.draftEntry.totalDebit, 150000);
  assert.strictEqual(result.draftEntry.totalCredit, 150000);
});

test('الخطوة الثالثة ورابعة: التقاط الأوامر الشفهية ومطابقة دليل الحسابات وتوجيه القيد', () => {
  const spokenText = 'تم الصرف من الخزنة بمبلغ 5000 جنيه لحساب صيانة وإصلاحات';

  const intention = advancedVoiceProcessor.parseVoiceIntention(spokenText);
  assert.strictEqual(intention.amount, 5000);
  assert.strictEqual(intention.intent, 'EXPENSE');
  assert.strictEqual(intention.paymentMethod, 'CASH');

  const draftEntry = advancedVoiceProcessor.generateBalancedEntry(intention);
  assert.ok(draftEntry);
  assert.strictEqual(draftEntry.total, 5000);
  assert.strictEqual(draftEntry.lines.length, 2);

  // السطر الأول: مدين (مصروفات صيانة وإصلاحات)
  const debitLine = draftEntry.lines.find((l) => l.debit > 0);
  assert.ok(debitLine);
  assert.strictEqual(debitLine?.debit, 5000);

  // السطر الثاني: دائن (الخزينة)
  const creditLine = draftEntry.lines.find((l) => l.credit > 0);
  assert.ok(creditLine);
  assert.strictEqual(creditLine?.credit, 5000);
});

test('الخطوة الخامسة: التنفيذ الآلي وإدخال التفاصيل والموافقة', () => {
  const user: any = {
    id: 'usr-admin',
    fullName: 'مدير النظام',
    role: 'SYSTEM_ADMIN',
    organizationId: 'org-general',
  };

  const outcome = aiActionsService.handle(user, 'org-general', 'create_receipt', {
    amount: 2500,
    fromName: 'عضو نقابي - تحصيل اشتراك',
    description: 'تسجيل تحصيل آلي عبر الذكاء الاصطناعي',
    paymentMethod: 'CASH',
    autoPostJournal: true,
  });

  assert.strictEqual(outcome.status, 'needs_confirmation');
  assert.ok(outcome.confirmation);
  assert.strictEqual(outcome.confirmation.payload.amount, 2500);

  const confirmation = aiActionsService.confirm(user, 'org-general', 'create_receipt', outcome.confirmation.payload);
  assert.ok(confirmation);
  assert.strictEqual(confirmation.status, 'executed');
  assert.ok(confirmation.result);
  assert.ok(confirmation.result.receipt);
  assert.strictEqual(confirmation.result.receipt.amount, 2500);
});
