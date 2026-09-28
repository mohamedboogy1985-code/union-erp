/**
 * P0-1 — منع تصنيع البيانات (Anti-Fabrication Guard)
 * =====================================================
 * المرجع: docs/AI_AGENT_AUDIT.md (بند P0-1)
 *
 * كان النظام — عند غياب مفتاح Gemini أو تعذّر الاستخراج — يخترع بيانات محاسبية ويعرضها
 * للمستخدم كأنها نتيجة حقيقية:
 *   • فاتورة وهمية (INV-2026-9041) ومورد وهمي («شركة الأمل للمقاولات والتوريدات»)
 *     ورقم ضريبي وهمي (102-394-881) ومبالغ (45,000 + 6,300 = 51,300 ج.م) → قيد «متوازن».
 *   • أول حساب في الدليل (erpStore.accounts[0]) كحلّ لأي كود غير معروف.
 *   • مبلغ 500 ج.م وطرف «العضو أحمد مصطفى» لأي إملاء صوتي غير مفهوم.
 *   • نسبة ثقة مختلَقة (0.92 / 0.95 / 0.96 / 1.0) وحالة «VERIFIED» بلا تحقق.
 *   • رسائل نجاح لعمليات غير مُنفَّذة (التسوية البنكية الآلية).
 *
 * هذه الاختبارات تثبّت العقد الجديد:
 *   1) التعذّر يُعلن صراحةً (AI_UNAVAILABLE / UNPARSEABLE / provenance=UNAVAILABLE).
 *   2) كل accountId يعود لسجل حقيقي في الدليل النشط.
 *   3) لا أرقام/أسماء/حالات مُختلَقة في الكود (حراسة ثابتة على المصدر بعد إزالة التعليقات).
 *
 * التشغيل: npx tsx --test test/ai-no-fabrication.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// ضمان غياب محرك الذكاء الاصطناعي طوال الاختبار — السلوك المطلوب فحصه هو مسار التعذّر
// ---------------------------------------------------------------------------
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.AI_ASSISTANT_GEMINI_API_KEY;

const { aiService } = await import('../server/services/ai.service.js');
const { erpStore } = await import('../server/db/store.js');

/** يقرأ ملفاً من المستودع ويزيل التعليقات حتى لا تُحسب التوثيقات كانتهاكات. */
function sourceCode(relPath: string): string {
  const raw = readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1'); // line comments (دون مساس بالروابط)
}

function assertAbsent(relPath: string, forbidden: (string | RegExp)[], note: string) {
  const code = sourceCode(relPath);
  for (const pattern of forbidden) {
    if (typeof pattern === 'string') {
      assert.ok(!code.includes(pattern), `${relPath}: وُجد النمط الممنوع «${pattern}» — ${note}`);
    } else {
      assert.ok(!pattern.test(code), `${relPath}: وُجد النمط الممنوع /${pattern.source}/ — ${note}`);
    }
  }
}

function assertPresent(relPath: string, required: (string | RegExp)[], note: string) {
  const code = sourceCode(relPath);
  for (const pattern of required) {
    if (typeof pattern === 'string') {
      assert.ok(code.includes(pattern), `${relPath}: النمط المطلوب «${pattern}» مفقود — ${note}`);
    } else {
      assert.ok(pattern.test(code), `${relPath}: النمط المطلوب /${pattern.source}/ مفقود — ${note}`);
    }
  }
}

const realAccountIds = new Set(erpStore.accounts.map((a: any) => a.id));
assert.ok(realAccountIds.size > 10, 'دليل الحسابات يجب أن يكون محملاً قبل الاختبار');

// ===========================================================================
// القسم الأول: سلوك الخدمة عند تعذّر محرك الذكاء الاصطناعي
// ===========================================================================

test('قراءة مستند بدون محرك: تعذّر صريح بلا فاتورة أو قيد مختلَق', async () => {
  const result = await aiService.parseSlipAndSuggestJournal('فاتورة شراء مستلزمات مكتبية بقيمة 5000 جنيه من مورد');

  assert.equal(result.status, 'AI_UNAVAILABLE', 'يجب إعلان التعذّر لا اقتراح قيد');
  assert.equal(result.provenance, 'UNAVAILABLE');
  assert.deepEqual(result.lines, [], 'لا تُقترح أي سطور عند التعذّر');
  assert.ok(result.error && result.error.length > 10, 'رسالة خطأ واضحة للمستخدم مطلوبة');

  const serialized = JSON.stringify(result);
  for (const fabricated of ['INV-2026-9041', '102-394-881', 'شركة الأمل للمقاولات والتوريدات', '51300', '51,300']) {
    assert.ok(!serialized.includes(fabricated), `قيمة مختلَقة ظهرت في النتيجة: ${fabricated}`);
  }
});

test('إملاء صوتي غير مفهوم: UNPARSEABLE بلا مبلغ أو طرف مختلَق', async () => {
  const result = await aiService.parseVoiceDictation('أهلاً كيف حالك اليوم؟');

  assert.equal(result.intent, 'UNPARSEABLE');
  assert.equal(result.provenance, 'UNAVAILABLE');
  assert.ok(!result.structuredData || !Object.keys(result.structuredData).length, 'لا مسودة عند غياب عملية قابلة للاستخلاص');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('العضو أحمد مصطفى'), 'اسم دافع مختلَق');
  assert.ok(!/"amount":500\b/.test(serialized), 'مبلغ 500 ج.م مختلَق');
});

test('إملاء صوتي مفهوم: الحسابات والمبالغ من الدليل والنص فقط، والثقة ≤ 0.95', async () => {
  const result = await aiService.parseVoiceDictation('ادفع 5000 جنيه نقداً من الخزينة');

  assert.ok(['JOURNAL_ENTRY', 'RECEIPT', 'PAYMENT', 'UNPARSEABLE'].includes(result.intent), `intent غير متوقع: ${result.intent}`);
  assert.ok(['MODEL', 'DETERMINISTIC', 'UNAVAILABLE'].includes(result.provenance), 'provenance إلزامي');
  assert.ok((result.confidence ?? 0) <= 0.95, 'لا ثقة مختلَقة فوق 0.95 في المسار المحلي');

  const lines = (result.structuredData as any)?.lines || [];
  for (const line of lines) {
    assert.ok(realAccountIds.has(line.accountId), `accountId غير موجود في الدليل: ${line.accountId}`);
    assert.ok(Number(line.debit) > 0 || Number(line.credit) > 0, 'سطر بلا مبلغ');
  }
  if (lines.length >= 2) {
    const debit = lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    assert.ok(Math.abs(debit - credit) <= 0.001, 'القيد المقترح يجب أن يكون متوازناً');
    assert.ok(debit === 5000, `المبلغ يجب أن يأتي من النص المملى لا من قيمة افتراضية (حصلنا على ${debit})`);
  }
});

test('المساعد المالي بدون محرك: أرقام محسوبة من السجلات وإعلان صريح للمصدر', async () => {
  const result = await aiService.queryFinancialAssistant('كم إجمالي الديون المستحقة على العملاء؟', 'org-general');

  assert.equal(result.provenance, 'DETERMINISTIC', 'المسار المحلي يجب أن يُعلن DETERMINISTIC');
  assert.match(result.answer, /محسوب محلياً|غير مفعّل/, 'يجب إفهام المستخدم أن الأرقام محلية');
  assert.ok(!/شركة الأمل للمقاولات والتوريدات/.test(result.answer), 'مورد مختلَق');
  assert.ok(
    !/جميع القيود مرحلة ومتوازنة وتتوافق/.test(result.answer),
    'إقرار امتثال لم يُتحقق منه'
  );
});

test('المساعد العام بدون محرك: لا مسودة قيد ولا ادعاء تنفيذ', async () => {
  const result = await aiService.globalAssistantChat('سجّل قيد مصروف كهرباء 500 جنيه', 'org-general');

  assert.equal(result.provenance, 'UNAVAILABLE');
  assert.equal(result.proposedEntry, undefined, 'لا مسودة بدون محرك');
  assert.equal(result.postedEntry, undefined, 'لا ترحيل بدون محرك');
  assert.match(result.answer, /لم تُقترح أي مسودة|غير متصل/);
});

// ===========================================================================
// القسم الثاني: حراسة ثابتة على المصدر — أنماط التصنيع ممنوعة في الكود
// (التعليقات تُزال أولاً، فتوثيق ما حُذف لا يُعدّ انتهاكاً)
// ===========================================================================

test('ai.service.ts: لا حلول احتياطية تختلق حساباً أو فاتورة أو ثقة', () => {
  assertAbsent(
    '../server/services/ai.service.ts',
    [
      'erpStore.accounts[0]',
      'accounts[0]',
      'INV-2026-9041',
      '102-394-881',
      'شركة الأمل للمقاولات والتوريدات',
      'buildFallback',
      /amount:\s*500\b/,
      /confidence:\s*0\.92\b/,
      /51300/,
    ],
    'أي من هذه الأنماط يعيد تصنيع البيانات'
  );
  assertPresent(
    '../server/services/ai.service.ts',
    ['AIProvenance', 'AiExtractionResult', "'AI_UNAVAILABLE'", "'UNPARSEABLE'", 'extractionUnavailable', 'unresolved'],
    'عقد الإعلان الصريح عن التعذّر ومصدر النتيجة مفقود'
  );
});

test('AIAssistant.tsx: لا معرّفات حسابات أو أطراف أو مبالغ مختلَقة في الواجهة', () => {
  assertAbsent(
    '../src/pages/AIAssistant.tsx',
    ["'acc-1301'", "'acc-5101'", "'acc-1101'", 'العضو أحمد مصطفى', '|| 500', 'شركة الأمل', "'INV-01'"],
    'الواجهة كانت تخترع حسابات وأطرافاً ومبالغ'
  );
  assertPresent(
    '../src/pages/AIAssistant.tsx',
    ['l.accountId', "'UNPARSEABLE'", "'AI_UNAVAILABLE'", 'provenance'],
    'يجب استخدام معرّفات الخادم والتعامل مع التعذّر'
  );
});

test('Banking.tsx: لا إعلان نجاح لتسوية بنكية غير مُنفَّذة', () => {
  const code = sourceCode('../src/pages/Banking.tsx');
  const handler = code.slice(code.indexOf('const handleAutoReconcile'), code.indexOf('const handleAutoReconcile') + 900);
  assert.ok(handler.length > 100, 'لم يُعثر على handleAutoReconcile');
  assert.ok(!/onShowToast\(\s*'success'/.test(handler), 'رسالة نجاح لعملية غير مُنفَّذة = تصنيع حالة');
  assert.match(handler, /غير مفعّلة|لم تُنفَّذ/);
});

test('CustomAgentStudio.tsx: إفصاح صريح بأن الردود محاكاة محلية', () => {
  assertPresent(
    '../src/components/CustomAgentStudio.tsx',
    ['SIM_PREFIX', 'وضع عرض', 'محاكاة نصية'],
    'يجب وسم ردود الاستوديو كمحاكاة'
  );
  assertAbsent(
    '../src/components/CustomAgentStudio.tsx',
    ['قمت بتحليل طلبك', 'وفق التوجيهات الضريبية المعتمدة', 'قمت بمراجعة استفسارك'],
    'ادعاءات تنفيذ/تحليل لم تحدث'
  );
});

test('aetherswarm.routes.ts: لا محاكاة بعد التصلّب — الخطة والتنفيذ من أدوات ERP حقيقية', () => {
  // محرّك المحاكاة والخطة الجاهزة (RTX) حُذفا: لا نص مُعدّ مسبقاً يُعرض كانه تنفيذ
  assertAbsent(
    '../server/routes/aetherswarm.routes.ts',
    [
      'SIMULATION_NOTE',
      'simulateCognitiveStep',
      'generateCognitiveSwarmPlan',
      "provenance: 'SIMULATED'",
      'desktopAction:',
      'RTX 5090',
      'Playwright',
      'Windows Operator',
    ],
    'محرّك المحاكاة أو خطة وهمية ما زال موجوداً'
  );
  assertPresent(
    '../server/routes/aetherswarm.routes.ts',
    ['createAetherSession', 'executeAetherStep', 'resolveAetherConflict', 'READ_ONLY_ERP'],
    'الخطة والتنفيذ يجب أن يمرّا عبر سجل أدوات ERP'
  );
  // التحكيم بلا أدلة (أو بلا مهمة) لا يدّعي حسم التعارض ولا يخترع نسبة ثقة
  assert.match(sourceCode('../server/routes/aetherswarm.routes.ts'), /resolved:\s*false,/, 'التحكيم بلا أدلة يجب ألا يدّعي حسم التعارض');
  assert.match(sourceCode('../server/routes/aetherswarm.routes.ts'), /finalConfidence:\s*0,/, 'لا نسبة ثقة مختلَقة عند تعذّر التحكيم');
});

test('AetherSwarmApp.tsx: لا ثقة مختلَقة ولا سجلات تدقيق «VERIFIED» مزروعة', () => {
  assertAbsent(
    '../src/aetherswarm/AetherSwarmApp.tsx',
    [/\|\|\s*0\.9[56]\b/, /executionTimeMs:\s*420\b/, 'Return Code 0 - Verified by Critic', 'verified: true',],
    'قيم ثقة وحالات تحقق مختلَقة'
  );
  // لا بيانات مزروعة: الخطة فارغة حتى يطلب المستخدم، والحالة تُقرأ من الخادم
  assertPresent(
    '../src/aetherswarm/AetherSwarmApp.tsx',
    ['DEMO_TAG', 'demoBlackboard', 'demoMemory', 'taskId', "model: 'DETERMINISTIC'"],
    'عقد السرب الحقيقي (حالة مهمة على الخادم + وكلاء حتميون) مفقود'
  );
});

test('src/types/erp.ts: عقد الإملاء يشمل UNPARSEABLE وprovenance', () => {
  assertPresent(
    '../src/types/erp.ts',
    ["'UNPARSEABLE'", 'provenance'],
    'نوع VoiceParsedTransaction يجب أن يدعم الإعلان الصريح عن التعذّر'
  );
});
