/**
 * P0-3 / P0-4 — دوام التدقيق وسلسلتَي التجزئة، وإغلاق القراءة غير الموثّقة
 * ==========================================================================
 * المرجع: docs/AI_AGENT_AUDIT.md
 *
 * ما كان يحدث قبل الإصلاح (مقيس حيّاً بلا أي ترويسة):
 *   GET /api/employees · /api/journal-entries · /api/audit-logs · /api/ledger-chain/verify
 *   → 200 مع البيانات المالية كاملة (≈62 من 69 نقطة قراءة).
 * وكان سجل التدقيق وسلسلة الأستاذ في الذاكرة فقط، وتجزئة v1 لا تُدخل نص التفاصيل
 * في مضمونها (فتعديل «ماذا حدث» يمرّ بلا كسر).
 *
 * ما تثبته هذه الاختبارات:
 *   1) حارس `/api`: المنع افتراضاً — لا هوية = 401، القائمة العامة فقط مستثناة،
 *      وكل رفض يُسجَّل في سجل التدقيق (BLOCKED).
 *   2) تجزئة الأستاذ: حتمية عبر تمثيلات الأرقام/ترتيب الأسطر، موسومة (`v2:`)،
 *      وتكشف أي تعديل، وتميّز الترميز القديم عن التلاعب.
 *   3) تجزئة التدقيق (`a2`): **نص التفاصيل جزء من المضمون** — تعديله يكسر السلسلة.
 *   4) سياق الطلب: عنوان IP ومعرّف الارتباط يُلتقطان من الطلب ويُستخدمان في التدقيق.
 *
 * التشغيل: npx tsx --test test/security-audit-chain.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';

const { installApiGuard, isPublicApiPath } = await import('../server/security/api-guard.js');
const { withRequestContext, getRequestContext, resolveClientIp } = await import(
  '../server/security/request-context.js'
);
const { rebuildLedgerChain, resealLedgerChain, verifyLedgerChain, hashJournalEntry } = await import(
  '../server/services/ledger-chain.service.js'
);
const { resealAuditLogChain, verifyAuditLogChain, hashAuditLog, isVersionedAuditHash } = await import(
  '../server/services/audit-chain.service.js'
);
const { erpStore } = await import('../server/db/store.js');

const GENESIS = '0'.repeat(64);

// ---------------------------------------------------------------------------
// 1) حارس /api — المنع افتراضاً
// ---------------------------------------------------------------------------

/** تطبيق مصغّر: الحارس + نقطتان (قراءة مالية + نقطة عامة) */
async function startGuardedApp() {
  const app = express();
  const rejections: { path: string; reason: string }[] = [];
  const guard = installApiGuard(app, {
    resolveUser: (req) => {
      const id = String(req.headers['x-user-id'] || '');
      return erpStore.users.find((u: any) => u.id === id) || null;
    },
    onRejected: (_req, info) => rejections.push({ path: info.path, reason: info.reason }),
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/employees', (_req, res) => res.json([{ id: 'emp-1', salary: 1000 }]));
  app.get('/api/journal-entries', (_req, res) => res.json([{ id: 'je-1' }]));

  const server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    rejections,
    guard,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('الحارس: قراءة البيانات المالية بلا هوية → 401 AUTH_REQUIRED', async () => {
  const app = await startGuardedApp();
  try {
    for (const path of ['/api/employees', '/api/journal-entries']) {
      const res = await fetch(`${app.base}${path}`);
      assert.equal(res.status, 401, `${path} يجب أن يرفض بلا هوية`);
      const body = (await res.json()) as any;
      assert.equal(body.code, 'AUTH_REQUIRED');
    }
    // كل رفض مسجَّل (لا رفض صامت)
    assert.equal(app.guard.rejectedCount(), 2);
    assert.ok(app.rejections.every((r) => r.reason === 'AUTH_REQUIRED'));
  } finally {
    await app.close();
  }
});

test('الحارس: هوية صريحة لمستخدم قائم → 200، ومستخدم مجهول → 401', async () => {
  const app = await startGuardedApp();
  const user = erpStore.users.find((u: any) => u.isActive) as any;
  assert.ok(user, 'مطلوب مستخدم فعّال من المتجر');
  try {
    const ok = await fetch(`${app.base}/api/employees`, { headers: { 'x-user-id': user.id } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), [{ id: 'emp-1', salary: 1000 }]);

    const unknown = await fetch(`${app.base}/api/employees`, { headers: { 'x-user-id': 'usr-not-real' } });
    assert.equal(unknown.status, 401, 'هوية غير معروفة لا تُقبل');
  } finally {
    await app.close();
  }
});

test('الحارس: النقاط العامة فقط تمرّ قبل الدخول', async () => {
  assert.ok(isPublicApiPath('/api/health'));
  assert.ok(isPublicApiPath('/api/auth/login'));
  assert.ok(isPublicApiPath('/api/auth/login/2fa'));
  assert.ok(isPublicApiPath('/api/operator-assistant/status'));
  assert.ok(isPublicApiPath('/api/verify-receipt/abc-123'));
  assert.ok(isPublicApiPath('/api/health?verbose=1'));
  assert.equal(isPublicApiPath('/api/employees'), false);
  assert.equal(isPublicApiPath('/api/audit-logs'), false);
  assert.equal(isPublicApiPath('/api/verify-receipt'), false);

  const app = await startGuardedApp();
  try {
    const health = await fetch(`${app.base}/api/health`);
    assert.equal(health.status, 200, 'نقطة الصحة عامة');
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// 2) سلسلة الأستاذ — حتمية وموسومة وتكشف التعديل
// ---------------------------------------------------------------------------

function makeEntry(overrides: Record<string, any> = {}): any {
  return {
    id: 'je-1',
    entryNumber: 'JV-2026-0001',
    date: '2026-01-15',
    description: 'قيد اختبار',
    status: 'POSTED',
    type: 'PAYMENT',
    organizationId: 'org-union-main',
    totalDebit: 500,
    totalCredit: 500,
    lines: [
      {
        id: 'l1',
        lineNumber: 1,
        accountId: 'acc-1',
        accountCode: '1101',
        debit: 500,
        credit: 0,
        description: 'مدين',
      },
      {
        id: 'l2',
        lineNumber: 2,
        accountId: 'acc-2',
        accountCode: '1210',
        debit: 0,
        credit: 500,
        description: 'دائن',
      },
    ],
    ...overrides,
  };
}

test('تجزئة الأستاذ حتمية: نفس القيد بأرقام نصية أو ترتيب أسطر مختلف = نفس التجزئة', () => {
  const asNumbers = makeEntry();
  const asStrings = makeEntry({
    totalDebit: '500.00',
    totalCredit: '500.00',
    lines: [
      { ...makeEntry().lines[1], debit: '0.00', credit: '500.00' },
      { ...makeEntry().lines[0], debit: '500.00', credit: '0.00' },
    ],
  });
  assert.equal(
    hashJournalEntry(asNumbers, GENESIS),
    hashJournalEntry(asStrings, GENESIS),
    'اختلاف التمثيل أو ترتيب الأسطر لا يجوز أن يغيّر التجزئة'
  );
});

test('تجزئة الأستاذ موسومة بإصدارها (v2:)', () => {
  const hash = hashJournalEntry(makeEntry(), GENESIS);
  assert.match(hash, /^v2:[0-9a-f]{64}$/);
  assert.equal(isVersionedAuditHash(hash), false, 'وسم ترميز مختلف');
});

test('إعادة البناء تختم القيود وتكشف أي تعديل لاحق', () => {
  const entries = [makeEntry({ id: 'a', entryNumber: 'JV-1', date: '2026-01-01' }), makeEntry({ id: 'b', entryNumber: 'JV-2', date: '2026-01-02' })];

  const before = verifyLedgerChain(entries);
  assert.equal(before.chainValid, false, 'قيود بلا تجزئة = غير موثّقة');

  const sealed = rebuildLedgerChain(entries);
  assert.equal(sealed.tamperedCount, 0);
  assert.equal(verifyLedgerChain(entries).chainValid, true);
  assert.equal(verifyLedgerChain(entries).verifiedCount, 2);

  // تعديل مبلغ قيد بعد الختم ⇒ كشف فوري
  entries[1].totalDebit = 999999;
  const tampered = verifyLedgerChain(entries);
  assert.equal(tampered.chainValid, false);
  assert.ok(tampered.tamperedCount >= 1);
  assert.ok(tampered.tamperedEntries.some((e) => e.reason === 'HASH_MISMATCH' || e.reason === 'BREAK_IN_CHAIN'));
});

test('التمييز بين الترميز القديم والتلاعب: تجزئة غير موسومة تُرقّى ولا تُتَّهم', () => {
  const entries = [makeEntry()];
  rebuildLedgerChain(entries);
  entries[0].currentHash = 'legacy-hash-without-version';
  const result = verifyLedgerChain(entries);
  assert.equal(result.legacyFormatCount, 1);
  assert.equal(result.tamperedCount, 0, 'ترميز قديم ≠ تلاعب');
  assert.equal(result.chainValid, false, 'لكن السلسلة ليست متحقَّقة بعد');

  const resealed = resealLedgerChain(entries);
  assert.equal(resealed.tamperedCount, 0);
  assert.equal(verifyLedgerChain(entries).chainValid, true);
});

// ---------------------------------------------------------------------------
// 3) سلسلة التدقيق (a2): التفاصيل جزء من المضمون
// ---------------------------------------------------------------------------

function makeLog(overrides: Record<string, any> = {}): any {
  return {
    id: 'AUDIT-1',
    timestamp: '2026-01-15T10:00:00.000Z',
    userId: 'usr-1',
    action: 'JOURNAL_POSTED',
    entityType: 'JOURNAL_ENTRY',
    entityId: 'je-1',
    details: 'ترحيل القيد JV-2026-0001 بمبلغ 500',
    status: 'SUCCESS',
    correlationId: 'CORR-1',
    previousState: undefined,
    newState: undefined,
    ...overrides,
  };
}

test('تجزئة التدقيق a2: تعديل نص التفاصيل يكسر السلسلة', () => {
  const original = makeLog();
  const sealed: any[] = [
    { ...makeLog({ id: 'AUDIT-1' }), previousHash: GENESIS },
    { ...makeLog({ id: 'AUDIT-2', timestamp: '2026-01-15T10:05:00.000Z' }) },
  ];
  const { changed } = resealAuditLogChain(sealed);
  assert.ok(changed > 0);
  assert.equal(verifyAuditLogChain(sealed, 'memory').valid, true);

  // تعديل «ماذا حدث» فقط — كان يمرّ في v1 بلا كسر
  sealed[0].details = 'ترحيل القيد JV-2026-0001 بمبلغ 5,000,000';
  const tampered = verifyAuditLogChain(sealed, 'memory');
  assert.equal(tampered.valid, false);
  assert.ok(tampered.brokenCount >= 1, 'تعديل التفاصيل يجب أن يُكتشف');

  assert.notEqual(
    hashAuditLog(original, GENESIS),
    hashAuditLog({ ...original, details: 'نص آخر تماماً' }, GENESIS),
    'نص التفاصيل داخل مضمون التجزئة'
  );
});

test('تجزئة التدقيق موسومة (a2:) والترميز القديم لا يُحتسب تلاعباً', () => {
  const logs: any[] = [{ ...makeLog(), previousHash: GENESIS }];
  const { tip } = resealAuditLogChain(logs);
  assert.match(String(logs[0].eventHash), /^a2:[0-9a-f]{64}$/);
  assert.equal(tip, logs[0].eventHash);

  logs[0].eventHash = 'deadbeef-old-format';
  const legacy = verifyAuditLogChain(logs, 'memory');
  assert.equal(legacy.legacyFormatCount, 1);
  assert.equal(legacy.brokenCount, 0);
  assert.equal(legacy.valid, false);
});

// ---------------------------------------------------------------------------
// 4) سياق الطلب: IP حقيقي + معرّف ارتباط
// ---------------------------------------------------------------------------

test('سياق الطلب يُلتقط ويُقرأ داخل الطلب فقط', async () => {
  assert.equal(getRequestContext(), undefined, 'خارج أي طلب لا سياق');

  const app = express();
  app.use(withRequestContext);
  app.get('/api/who', (req, res) => {
    res.json({ context: getRequestContext(), ip: resolveClientIp(req) });
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/who`, {
      headers: { 'x-correlation-id': 'CORR-TEST-42', 'x-forwarded-for': '10.1.2.3, 10.0.0.1' },
    });
    const body = (await res.json()) as any;
    assert.equal(body.context?.correlationId, 'CORR-TEST-42');
    assert.equal(body.context?.ipAddress, '10.1.2.3');
    assert.equal(body.ip, '10.1.2.3');
    assert.equal(res.headers.get('x-correlation-id'), 'CORR-TEST-42');
    assert.equal(getRequestContext(), undefined, 'السياق لا يتسرّب بعد انتهاء الطلب');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
