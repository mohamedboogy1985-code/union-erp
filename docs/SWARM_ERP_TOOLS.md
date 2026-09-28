# سرب أدوات ERP الحقيقية — التصميم والتشغيل

> قرار المستخدم: **الخيار (ب) «سرب أدوات ERP حقيقية»** من `docs/SWARM_PROPOSAL_EVALUATION.md`.
> تم **إسقاط** قدرات التحكم بالحاسوب (PowerShell / browser CDP / رؤية الشاشة / نماذج محلية)،
> وربط السرب بأدوات هذا المستودع الحقيقية عبر بوابة الصلاحيات نفسها.

## 1. الفكرة في سطرين

بدلاً من «وكيل يتحكم في جهاز» (وهو ما لا يخصّ نظام محاسبي)، صار السرب **مُنسِّقاً لأدوات قراءة حقيقية**:
يختار أدوات من طلب المستخدم، يبني خطة بخطوات لكل خطوة فيها «حالة نجاح متوقعة» وبدائل، ينفّذها على
بيانات المتجر الفعلية، ثم **لا يُعلن النجاح إلا بعد تحقق مستقل ودليل فعلي**. والفشل يُعلن كفشل.

## 2. الملفات

| الملف | الدور |
| --- | --- |
| `server/services/swarm/tools.ts` | سجل الأدوات (10 أدوات، **قراءة فقط**) + أنواع الدليل/المصدر + المُنتقي الحتمي |
| `server/services/swarm/task-state.service.ts` | حالة المهمة على الخادم، كاشف الفشل، إعادة التخطيط المحدودة، بوابة التحقق، التدقيق |
| `server/routes/swarm-tools.routes.ts` | `GET /api/swarm/tools` · `POST/GET /api/swarm/tasks` · `GET /api/swarm/tasks/:id` · `POST .../run` · `POST .../run-all` |
| `test/swarm-erp-tools.test.ts` | 10 اختبارات لمحرّك السرب على بيانات المتجر الحقيقية |
| `test/swarm-tools-routes.test.ts` | 6 اختبارات تكامل عبر HTTP (صلاحيات، حالات نهائية، تدقيق) |

## 3. الأدوات الحقيقية (لا واجهات مُختلقة)

كل أداة تنادي خدمة قائمة فعلاً في المستودع، وتُعلن صلاحيتها، وتُعيد `evidence` من الصفوف التي قرأتها:

| الأداة | الخدمة الحقيقية | الصلاحية |
| --- | --- | --- |
| `report.trial-balance` | `reportsService.getTrialBalance` | `view:all` |
| `report.income-expense` | `reportsService.getIncomeExpenseReport` | `view:all` |
| `report.receipts-payments` | `reportsService.getReceiptsPaymentsStatement` | `view:all` |
| `accounts.search` | `erpStore.accounts` (مطابقة بعد تطبيع عربي) | `search:all` |
| `ledger.search-entries` | `erpStore.journalEntries` | `view:all` |
| `subledger.party-statement` | `reportsService.getSubledgerPartyStatement` | `view:all` |
| `rag.search` | `embeddingService` (P3: TF-IDF محلي + اختياري pgvector) | `search:all` |
| `audit.recent-events` | `erpStore.auditLogs` | `audit:read` |
| `ledger.verify-chain` | `verifyLedgerChain` (سلسلة التجزئة) | `audit:read` |
| `ocr.extract-document` | `enhancedOCRService.processDocument` | `documents:manage` |

الحقائق التي تحكم الأدوات:

- **قراءة فقط للجميع** (`readOnly: true`) — أي مهمة قابلة لإعادة التنفيذ بلا أثر جانبي.
- **لا اختراع بيانات**: غياب البيانات يُعلن `UNAVAILABLE` مع دليل `ABSENCE` (مثال حقيقي: البحث عن
  `1301` في هذا الدليل لا يوجد له رمز ⇒ «تعذّر التنفيذ» بصراحة، لا صفر ولا رصيد مخترع).
- **كل نتيجة تحمل مصدرها**: `DETERMINISTIC` (حساب/قراءة مباشرة) أو `RAG` (مع درجة الثقة من P3)
  أو `UNAVAILABLE`، مع `scannedCount` لعدد الصفوف التي مرّ عليها فعلاً و`durationMs`.

## 4. العقد الأول: حالة المهمة على الخادم (`SwarmTaskState`)

الحالة تعيش على الخادم — لا في ذاكرة المتصفح كما كان في سطح AetherSwarm القديم:

```ts
interface SwarmTaskState {
  id; userRequest; intent; status;            // PLANNED | RUNNING | VERIFIED | FAILED | BLOCKED
  plan: SwarmPlanStep[];                      // الخطة بترتيب التنفيذ
  currentStepId: string | null;
  observations: string[];                     // ما لاحظه السرب فعلاً (بالعربية)
  evidence: SwarmEvidence[];                  // الأدلة المجمّعة (SAMPLE/AGGREGATE/HASH/MATCH/ABSENCE/INPUT)
  failures: SwarmStepFailure[];               // كل فشل بسببه ودرجته
  replanCount; maxReplans;                    // إعادة التخطيط مقيّدة
  confidence;                                 // 0..1 — محسوبة من الأدلة والتحقق، لا مُعلنة
  verification: { status: 'PENDING'|'PASSED'|'FAILED'; checkedBy: string[]; detail: string };
  blockedByPermission: { toolId; permission }[];  // الفجوات الصلاحية معلنة
}
```

## 5. العقد الثاني: الخطوة (`SwarmPlanStep`)

كل خطوة تعلن مسبقاً ما الذي يعتبر نجاحاً، ومتى تتوقف، وإلى أين تتراجع:

```ts
interface SwarmPlanStep {
  id; title; toolId; status;                  // PENDING | RUNNING | SUCCEEDED | FAILED | SKIPPED
  expectedState: string;                      // «ماذا يعني نجاح هذه الخطوة» نصاً صريحاً
  input: Record<string, unknown>;
  retries; maxRetries;                        // ميزانية محاولات لكل خطوة
  fallbacks: SwarmFallback[];                 // أدوات بديلة معلنة مسبقاً
  verification: { mode: 'TOOL'|'EVIDENCE_PRESENT'|'OK_FLAG'; minEvidence };
  result?: SwarmToolResult; failure?: SwarmStepFailure;
}
```

مصفوفة البدائل المعلنة مسبقاً (لا ارتجال عند الفشل):

| الأداة الأصلية | البديل |
| --- | --- |
| `report.trial-balance` | `report.income-expense` ← `accounts.search` |
| `subledger.party-statement` | `accounts.search` |
| `rag.search` | `accounts.search` |
| `ocr.extract-document` | `rag.search` |
| `ledger.search-entries` | `audit.recent-events` |

## 6. العقد الثالث: كاشف الفشل + إعادة تخطيط محدودة

خطوات التنفيذ الفعلية (`runSwarmStep`):

1. **بوابة الصلاحية**: إن لم يملك المستخدم صلاحية الأداة ⇒ لا تنفيذ إطلاقاً، والخطوة `FAILED`
   بسبب `PERMISSION`، والمهمة `BLOCKED` مع نص «لا تملك الصلاحية X». لا تجاوز ولا تعطيل.
2. **التنفيذ** على بيانات المتجر الحقيقية.
3. **تصنيف الفشل** عند الاعتراض: `UNAVAILABLE` (غياب بيانات) · `ERROR` (استثناء) ·
   `NO_EVIDENCE` (نجح شكلياً بلا دليل) · `PERMISSION`. كل فشل يُسجَّل في `failures` **ويُربط
   بالخطوة نفسها** (`step.failure`) كي يصل سببه للواجهة والتقارير.
4. **إعادة تخطيط واحدة فقط** (`maxReplans = 1`): يُضاف البديل المعلن كخطوة `PENDING`، ويُسجَّل
   في الملاحظات «إعادة تخطيط (1/1)». الخطوة الثانية الفاشلة لا تولّد بديلاً ثانياً — الفشل يتوقف
   ويُعلن. (مقيس باختبار 8 واختبار 5.)
5. عند نفاد الخطوات: إن لم يتحقق الشرط المستقل ⇒ الحالة `FAILED` مع سبب نصي غير فارغ.

## 7. العقد الرابع: بوابة الدليل قبل النجاح

- `finalizeTask` لا تُعطي `VERIFIED` إلا بشرطين معاً:
  1. **خطوة تحقق مستقلة** من تصنيف `VERIFICATION` (`ledger.verify-chain`) نجحت فعلاً ضمن الخطة.
  2. **أدلة غير فارغة** من نتائج الأدوات الحقيقية.
- `verification.checkedBy` يذكر الأداة التي تحققت بالاسم (`['ledger.verify-chain']`) و`detail` يذكر
  عدد الأدلة؛ و`confidence = 1` لا تُمنح إلا عند `PASSED`.
- أي حالة أخرى: `FAILED` أو `BLOCKED` — **لا يوجد مسار في الشيفرة يُنتج «نجاح» بلا تحقق**.
- كل خطوة وكل مهمة تُكتب في **سجل التدقيق الحقيقي** (`erpStore.auditLogs`) عبر `auditSwarmTask`
  بأفعال `SWARM_TASK_PLANNED` / `SWARM_STEP_EXECUTED` / `SWARM_TASK_COMPLETED`.

## 8. دليل التشغيل الحي (وضع الذاكرة، بيانات المستودع الحقيقية)

```
GET  /api/swarm/tools                       → 10 أدوات، كلها readOnly:true
POST /api/swarm/tasks  {"request":"اعرض ميزان المراجعة وأرصدة الحسابات وكشف حساب أحد الأطراف"}
      → intent: READ_RESULT · 4 خطوات (3 أدوات + تحقق سلسلة الأستاذ)
POST /api/swarm/tasks/<id>/run-all {"input":{"query":"120"}}
      → الحالة: VERIFIED · تحقق: PASSED بواسطة ledger.verify-chain
        الثقة: 1 · الأدلة: 10 · أنواعها: AGGREGATE, HASH, MATCH, SAMPLE · الفشل: 0
        ميزان المراجعة: 117 حساباً، مدين 951,307.2 ج.م = دائن 951,307.2 ج.م
        سلسلة الأستاذ: 3061 قيداً سليمة
سجل التدقيق:
  SWARM_TASK_COMPLETED  | SWARM_TASK | تنفيذ المهمة — الحالة VERIFIED
  SWARM_STEP_EXECUTED ×4 | SWARM_TASK | كل خطوة باسمها ونتيجتها
```

ومثال الفشل المُعلن (وهو المقصود): طلب رمز حساب غير موجود في الدليل ⇒
`FAILED — «تعذّر التنفيذ: لا يوجد حساب مطابق لـ 1301 في الدليل النشط»` بثقة 0.75 وأدلة من الخطوات
التي نجحت فعلاً. النظام لم يخترع رصيداً ولم يُعلن نجاحاً.

## 9. ما لم نبنِه ولماذا

| البند من المقترح الأصلي | القرار | السبب |
| --- | --- | --- |
| PowerShell / سطر أوامر Windows | ❌ رُفض | لا صلة له بنظام محاسبي، وخطر أمني مباشر على خادم فيه بيانات مالية |
| تحكم بالمتصفح (CDP) | ❌ رُفض | يوجد API داخلي حقيقي (`/api/*`) يغني عنه تماماً |
| رؤية الشاشة / نماذج رؤية محلية | ❌ رُفض | يستهلك موارد بلا حالة استخدام محاسبية مثبتة |
| تخزين حالة المهمة في المتصفح | ❌ رُفض | الحالة صارت على الخادم (قابلة للتدقيق وإعادة التشغيل) |
| «نجاح» بلا تحقق | ❌ رُفض | بوابة الدليل §7 هي العقد الحاكم |

## 10. اختبارات

| الملف | العدد | ما تثبته |
| --- | --- | --- |
| `test/swarm-erp-tools.test.ts` | 10 | السجل والصلاحيات، بيانات حقيقية + أدلة، صراحة الغياب، تحديد الأدوات الحتمي، عقد الخطوة، VERIFIED بالأدلة والتدقيق، إعادة تخطيط واحدة محدودة، 403 للصلاحيات، منع الخطة الوهمية |
| `test/swarm-tools-routes.test.ts` | 6 | المسارات عبر HTTP: السجل والصلاحيات، رفض المجهول، التخطيط على الخادم + التدقيق، `run-all` ⇒ VERIFIED، الفشل المُعلن، 403 + إعلان الفجوة |

التشغيل: `npm run test:swarm-tools` (مضمّن في `npm test`).
