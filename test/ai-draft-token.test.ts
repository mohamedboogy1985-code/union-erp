/**
 * P0-2 — تأكيد مُلزِم من الخادم + فصل المهام (SoD) لمسودات الذكاء الاصطناعي
 * ==========================================================================
 * المرجع: docs/AI_AGENT_AUDIT.md (البند P0-2)
 *
 * ما كان يحدث: `/api/ai/execute-entry` يقبل أي `proposedEntry` من المتصفح، ثم
 * يعدّل `entry.status = 'APPROVED'` يدوياً (متجاوزاً بوابة فصل المهام في
 * `accountingService.approveJournalEntry`) ويرحّل القيد — المُعدّ = المعتمد = المُرحّل.
 *
 * ما تثبته هذه الاختبارات:
 *   1) لا تنفيذ بلا رمز تأكيد (draftToken) موقّع من الخادم.
 *   2) الرمز أحادي الاستخدام (إعادة الاستخدام → 409) وقصير العمر (منتهٍ → 409)
 *      ومقصور على صاحبه (مستخدم آخر → 403) وموقّع (تعديل التوقيع → 401).
 *   3) المسودة المعدَّلة من العميل تُرفض (409 DRAFT_MISMATCH) — التنفيذ يعتمد نسخة الخادم.
 *   4) فصل المهام: غير المعفى (محاسب/مدير مالي أعدّ القيد) ينتهي قيده SUBMITTED لا POSTED.
 *   5) المعفى (SYSTEM_ADMIN) يمر عبر approve/post الحقيقيتين → POSTED.
 *   6) كل رفض يُسجَّل في سجل التدقيق (BLOCKED).
 *
 * التشغيل: npx tsx --test test/ai-draft-token.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { readFileSync } from 'node:fs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

const { aiDrafts, AiDraftTokenError, canonicalDraftHash } = await import('../server/services/ai-drafts.service.js');
const { erpStore } = await import('../server/db/store.js');
const { can } = await import('../server/security/permissions.js');
const { registerAICoreRoutes } = await import('../server/routes/ai-core.routes.js');

// ---------------------------------------------------------------------------
// بيئة الاختبار: مستخدمون حقيقيون من المتجر + مساران (معفى / غير معفى)
// ---------------------------------------------------------------------------
const adminUser = erpStore.users.find((u: any) => u.role === 'SYSTEM_ADMIN' && u.isActive);
const financeUser =
  erpStore.users.find((u: any) => u.role === 'CHIEF_FINANCIAL_OFFICER' && u.isActive) ||
  erpStore.users.find((u: any) => u.role !== 'SYSTEM_ADMIN' && can(u as any, 'journal:create') && u.isActive);
assert.ok(adminUser, 'مطلوب مستخدم SYSTEM_ADMIN للاختبار');
assert.ok(financeUser, 'مطلوب مستخدم مالي غير معفى من فصل المهام للاختبار');

const leafAccounts = erpStore.accounts.filter((a: any) => a.isActive && !a.isParent && !a.requiresSubledger);
assert.ok(leafAccounts.length >= 2, 'مطلوب حسابين فرعيين نشطين على الأقل');
const debitAccount = leafAccounts.find((a: any) => a.nature === 'DEBIT') || leafAccounts[0];
const creditAccount = leafAccounts.find((a: any) => a.id !== debitAccount.id && a.nature === 'CREDIT') || leafAccounts[1];

function makeDraft(amount = 750, description = 'قيد اختبار P0-2 — مصروف نثريات') {
  return {
    date: new Date().toISOString().split('T')[0],
    description,
    totalDebit: amount,
    totalCredit: amount,
    balanced: true,
    lines: [
      { accountCode: debitAccount.code, accountName: debitAccount.name, debit: amount, credit: 0, description },
      { accountCode: creditAccount.code, accountName: creditAccount.name, debit: 0, credit: amount, description },
    ],
  };
}

// سرّ توقيع ثابت للاختبار — __resetForTests يولّد سراً عشوائياً في وضع العرض،
// وتثبيته يُبقي الرموز الصادرة قابلة للفحص بعد إعادة ضبط المتجر.
const TEST_SECRET = 'test-ai-draft-secret-0123456789abcdef';
function resetDrafts(options?: { ttlMs?: number }) {
  aiDrafts.__resetForTests({ secret: TEST_SECRET, ...options });
}

let currentUser: any = null;
function requirePermission(_req: any, res: any, permission: string) {
  if (!currentUser) {
    res.status(401).json({ error: 'يلزم تسجيل الدخول.' });
    return null;
  }
  if (!can(currentUser, permission)) {
    res.status(403).json({ error: `لا تملك الصلاحية: ${permission}` });
    return null;
  }
  return currentUser;
}

const app = express();
app.use(express.json({ limit: '2mb' }));
registerAICoreRoutes(app, { requirePermission });

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function callExecute(body: any) {
  const res = await fetch(`${baseUrl}/api/ai/execute-entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function issueFor(user: any, draft: any = makeDraft()) {
  return aiDrafts.issue({
    draft,
    userId: user.id,
    organizationId: user.organizationId,
    source: 'GLOBAL_CHAT',
    provenance: 'MODEL',
  });
}

// erpStore.auditLogs يُخزَّن الأحدث أولاً (unshift) — أول تطابق هو أحدث سجل
function lastAudit(action: string) {
  return erpStore.auditLogs.find((log: any) => log.action === action);
}

// ===========================================================================
// وحدة الرمز نفسه
// ===========================================================================

test('البصمة القانونية ثابتة أمام ترتيب المفاتيح وصيغة الأرقام', () => {
  const a = { date: '2026-01-01', lines: [{ accountCode: '5101', debit: 5000, credit: 0 }] };
  const b = { lines: [{ credit: 0, debit: 5000.0, accountCode: '5101' }], date: '2026-01-01' };
  assert.equal(canonicalDraftHash(a), canonicalDraftHash(b));
  assert.notEqual(canonicalDraftHash(a), canonicalDraftHash({ ...a, date: '2026-01-02' }));
});

test('إصدار ثم فحص ثم استهلاك: دورة حياة الرمز', () => {
  resetDrafts();
  const draft = makeDraft();
  const issued = issueFor(financeUser, draft);

  assert.match(issued.draftToken, /^v1\.[\w-]+\.[\w-]+$/);
  assert.equal(issued.payloadHash, canonicalDraftHash(draft));
  assert.ok(issued.expiresAt > Date.now());

  const verified = aiDrafts.verify(issued.draftToken, financeUser);
  assert.equal(verified.draftId, issued.draftId);
  assert.equal(verified.userId, financeUser.id);
  assert.equal(verified.provenance, 'MODEL');

  const consumed = aiDrafts.consume(issued.draftToken, financeUser);
  assert.ok(consumed.consumedAt, 'يجب تعليم الرمز كمستهلك');

  // إعادة الاستخدام مرفوضة
  assert.throws(
    () => aiDrafts.consume(issued.draftToken, financeUser),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_TOKEN_REUSED' && err.status === 409
  );
});

test('تعديل التوقيع أو المستخدم أو الصلاحية يُرفض بالتصنيف الصحيح', () => {
  resetDrafts();
  const issued = issueFor(financeUser, makeDraft());

  // توقيع مُعدَّل
  const tampered = issued.draftToken.slice(0, -3) + (issued.draftToken.endsWith('aaa') ? 'bbb' : 'aaa');
  assert.throws(
    () => aiDrafts.verify(tampered, financeUser),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_TOKEN_INVALID' && err.status === 401
  );

  // مستخدم آخر
  assert.throws(
    () => aiDrafts.verify(issued.draftToken, adminUser),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_TOKEN_OWNER_MISMATCH' && err.status === 403
  );

  // صيغة خاطئة
  assert.throws(
    () => aiDrafts.verify('not-a-token', financeUser),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_TOKEN_MALFORMED'
  );

  // منتهٍ
  resetDrafts({ ttlMs: -1000 });
  const expired = issueFor(financeUser, makeDraft());
  assert.throws(
    () => aiDrafts.verify(expired.draftToken, financeUser),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_TOKEN_EXPIRED' && err.status === 409
  );
  resetDrafts();

  // مطابقة الحمولة: تعديل المبلغ من العميل يُكتشف
  const record = aiDrafts.verify(issueFor(financeUser, makeDraft(750)).draftToken, financeUser);
  assert.throws(
    () => aiDrafts.assertSamePayload(record, makeDraft(9000)),
    (err: any) => err instanceof AiDraftTokenError && err.code === 'DRAFT_MISMATCH' && err.status === 409
  );
  aiDrafts.assertSamePayload(record, makeDraft(750)); // مطابق → لا خطأ
});

// ===========================================================================
// المسار HTTP: /api/ai/execute-entry
// ===========================================================================

test('بدون رمز تأكيد: رفض 400 ولا قيد يُنشأ', async () => {
  resetDrafts();
  currentUser = financeUser;
  const before = erpStore.journalEntries.length;
  const { status, data } = await callExecute({ proposedEntry: makeDraft() });

  assert.equal(status, 400);
  assert.equal(data.code, 'DRAFT_TOKEN_REQUIRED');
  assert.equal(erpStore.journalEntries.length, before, 'لا يُنشأ أي قيد بلا رمز');
  assert.equal(lastAudit('AI_DRAFT_TOKEN_REJECTED')?.status, 'BLOCKED');
});

test('مسودة معدَّلة من العميل: رفض 409 DRAFT_MISMATCH', async () => {
  resetDrafts();
  currentUser = financeUser;
  const issued = issueFor(financeUser, makeDraft(750));
  const before = erpStore.journalEntries.length;

  const { status, data } = await callExecute({ draftToken: issued.draftToken, proposedEntry: makeDraft(90000) });
  assert.equal(status, 409);
  assert.equal(data.code, 'DRAFT_MISMATCH');
  assert.equal(erpStore.journalEntries.length, before, 'لا يُنشأ القيد المعدَّل');
  assert.match(lastAudit('AI_DRAFT_TOKEN_REJECTED')?.details || '', /DRAFT_MISMATCH/);
});

test('فصل المهام: مُعدّ المسودة غير المعفى ينتهي قيده SUBMITTED لا POSTED', async () => {
  resetDrafts();
  currentUser = financeUser;
  const draft = makeDraft(750, 'قيد اختبار SoD — غير معفى');
  const issued = issueFor(financeUser, draft);

  const { status, data } = await callExecute({ draftToken: issued.draftToken, proposedEntry: draft });
  assert.equal(status, 201);
  assert.equal(data.requiresApproval, true, 'يجب إعلان الحاجة إلى اعتماد');
  assert.equal(data.status, 'SUBMITTED');
  assert.equal(data.provenance, 'MODEL');
  assert.equal(data.draftId, issued.draftId);
  assert.match(data.message, /فصل المهام|اعتماد/);

  const entry = erpStore.journalEntries.find((e: any) => e.id === data.entryId);
  assert.ok(entry, 'القيد أُنشئ فعلاً');
  assert.equal(entry.status, 'SUBMITTED', 'لا ترحيل بلا اعتماد مستقل');
  assert.equal(entry.sourceDocumentId, issued.draftId, 'القيد مرتبط بمعرّف المسودة');
  assert.ok(entry.approvedBy === undefined || entry.approvedBy === null, 'لم يُعتمد ذاتياً');

  assert.ok(lastAudit('AI_ENTRY_SUBMITTED_FOR_APPROVAL'), 'يُسجَّل تقديم القيد للاعتماد');
  assert.ok(!lastAudit('AI_ENTRY_POSTED') || lastAudit('AI_ENTRY_POSTED')?.entityId !== entry.id, 'لا سجل ترحيل لهذا القيد');

  // إعادة استخدام نفس الرمز مرفوضة
  const replay = await callExecute({ draftToken: issued.draftToken, proposedEntry: draft });
  assert.equal(replay.status, 409);
  assert.equal(replay.data.code, 'DRAFT_TOKEN_REUSED');
});

test('المسار المعفى: اعتماد وترحيل عبر بوابات الخدمة الحقيقية → POSTED', async () => {
  resetDrafts();
  currentUser = adminUser;
  const draft = makeDraft(750, 'قيد اختبار SoD — مسار معفى');
  const issued = issueFor(adminUser, draft);

  const { status, data } = await callExecute({ draftToken: issued.draftToken, proposedEntry: draft });
  assert.equal(status, 201);
  assert.equal(data.requiresApproval, false);
  assert.equal(data.status, 'POSTED');

  const entry = erpStore.journalEntries.find((e: any) => e.id === data.entryId);
  assert.equal(entry.status, 'POSTED');
  assert.equal(entry.approvedBy, adminUser.id, 'الاعتماد مسجَّل باسم المستخدم الحقيقي');

  const postedAudit = lastAudit('AI_ENTRY_POSTED');
  assert.ok(postedAudit, 'يُسجَّل الترحيل في سجل التدقيق');
  assert.match(postedAudit.details, new RegExp(issued.draftId), 'سجل التدقيق يشير إلى معرّف المسودة');
  assert.match(postedAudit.details, /مستثنى من فصل المهام/);
});

test('رمز منتهٍ عبر HTTP: 409 ولا قيد', async () => {
  resetDrafts({ ttlMs: -1000 });
  currentUser = adminUser;
  // لا إعادة ضبط بعد الإصدار: يبقى السجل منتهياً فيُرفض بـ DRAFT_TOKEN_EXPIRED تحديداً
  const issued = issueFor(adminUser, makeDraft(750, 'قيد برمز منتهٍ'));

  const before = erpStore.journalEntries.length;
  const { status, data } = await callExecute({ draftToken: issued.draftToken });
  assert.equal(status, 409);
  assert.equal(data.code, 'DRAFT_TOKEN_EXPIRED');
  assert.equal(erpStore.journalEntries.length, before);
  resetDrafts();
});

test('محادثة المساعد بلا هوية: 401 (لا مسودات ولا رموز لمجهول)', async () => {
  currentUser = null;
  const res = await fetch(`${baseUrl}/api/ai/global-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'سجّل قيد مصروف 500 جنيه' }),
  });
  assert.equal(res.status, 401);

  const streamRes = await fetch(`${baseUrl}/api/ai/global-chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'سجّل قيد مصروف 500 جنيه' }),
  });
  assert.equal(streamRes.status, 401);
});

test('محادثة المساعد بهوية: تعلن المصدر ولا تصدر رمزاً بلا مسودة', async () => {
  resetDrafts();
  currentUser = financeUser;
  const res = await fetch(`${baseUrl}/api/ai/global-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'سجّل قيد مصروف كهرباء 500 جنيه' }),
  });
  const data: any = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.provenance, 'UNAVAILABLE', 'بلا محرك: تعذّر مُعلن');
  assert.equal(data.draftToken, undefined, 'لا رمز لمسودة غير موجودة');
});

test('ai-core.routes.ts: لا اعتماد ذاتي يدوي ولا تنفيذ بلا رمز', () => {
  const code = readFileSync(new URL('../server/routes/ai-core.routes.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');

  assert.ok(!code.includes("entry.status = 'APPROVED'"), 'الاعتماد اليدوي المباشر يجب أن يزول');
  assert.ok(!code.includes('AI_ENTRY_AUTO_APPROVED'), 'مسار الاعتماد الآلي الذاتي يجب أن يزول');
  for (const required of [
    'aiDrafts.consume',
    'assertSamePayload',
    'isSodExempt',
    'submitJournalEntry',
    'approveJournalEntry',
    'postJournalEntry',
    'DRAFT_TOKEN_REQUIRED',
    'requiresApproval',
  ]) {
    assert.ok(code.includes(required), `العنصر المطلوب مفقود في المسار: ${required}`);
  }
});

test('إغلاق الخادم', async () => {
  currentUser = null;
  server.close();
  await once(server, 'close');
});
