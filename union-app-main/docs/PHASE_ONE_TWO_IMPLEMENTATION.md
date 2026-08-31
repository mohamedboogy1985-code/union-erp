# تنفيذ المراحل (1–2) — الذكاء الاصطناعي الموحّد والبنية المستدامة

> **التاريخ:** 2026-08-31
> **المرجع:** `docs/performance-ai-review.md` في جذر المستودع
> **المرحلة 0** مُنفّذة وموثّقة سابقاً في `docs/PHASE_ONE_IMPLEMENTATION.md`.

---

## 1. مدخل ذكاء اصطناعي موحّد (Single AI Gateway)

- `server/services/ai.service.ts` أصبح له دالة رئيسية واحدة:
  - `globalAssistantChat(message, orgId, history, mode)` مع `mode: 'global' | 'accounting' | 'general'`.
- `queryFinancialAssistant` و `queryAccountantExpert`/`chatWithAccountantExpert` أصبحا يمرّان عبر البوابة نفسها، فلا يختلف السياق أو البرومبت بين الشاشات.
- إرجاع موحّد: `{ answer, proposedEntry, postedEntry, confidence, sources }`.

## 2. سياق ذكي مخزّن (Cached Context Builder)

- أُضيف:
  - `AIContextBundle` + `buildAIContext()` + `getAIContext()`.
  - الكاش 30 ثانية عبر `cacheService.wrapSync` بمفتاح `cache:ai-context:{orgId}:{bucket}`.
- السياق يشمل: دليل الحسابات، الميزان، الإيرادات/المصروفات، 1301 وأكبر المدينين، آخر الإيصالات، القيود المعلّقة، وملخص اللائحة المالية.
- توقف التكرار المرتفع في بناء السياق عند كل طلب.

## 3. Function Calling موحّد + أداة `lookup_accounts`

- `globalAssistantChat` يستخدم:
  - `create_journal_entry`
  - `post_journal_entry`
  - `query_erp_data` (أرقام حية)
  - `lookup_accounts` (اختيار الحساب الصحيح بالعربية)
- `lookupAccounts()` تستخدم فهرس `getAccountByCode` + تطابق `normalizeArabicText` + `calculateSimilarity` + قاعدة أنماط المعرفة.
- كل مسارات المساعد تمرّ عبر الأدوات نفسها.

## 4. تحقق JSON بعد Gemini + `responseJsonSchema`

- أُضيفت `parseGeminiJsonResponse()`: تحليل آمن، واستخلاص JSON من markdown عند الحاجة، وإرجاع `null` لإجبار المسار الاحتياطي.
- أُضيف `responseJsonSchema` في:
  - اقتراح قيد من مستند/صورة (`suggest-journal`)
  - تحويل الإملاء الصوتي إلى قيد (`voice-dictation`)
  - التوقعات المالية (`financial-forecast`)
- مدخل المحادثة العامة يعتمد أصلاً على `Function Calling` + `validateDraftEntry()` للتحقق الصارم من الأكواد والتوازن والأستاذ المساعد.

## 5. مسار مُتدفّق `/api/ai/global-chat/stream`

- أُضيف مسار SSE في `server/routes/ai-core.routes.ts`.
- يبثّ `evt.chunk` ثم `evt.done` مع `proposedEntry` و`confidence` و`sources`.
- `GlobalAiWidget.tsx` و`JournalAiAssistant.tsx` يقرآن الـ `ReadableStream`.
- أُضيف عميل موحّد `src/services/ai-stream.ts` (`streamGlobalAiChat`) يستخدمه كلا المكوّنين، في وحّد السلوك والتهيئة.

## 6. حذف الميزة الميتة `src/features/ai-support-agent`

- كانت تستخدم `new PrismaClient()` وغير موصولة بالخادم.
- المسار الفعلي `/api/ai/support-question` في `server.ts` كان يستخدم `smartAgentEnhancer` مباشرة.
- حُذف المجلد بالكامل دون فقد أي وظيفة قائمة.

## 7. شفافية الذكاء الاصطناعي في الواجهة

- `AIAssistant.tsx` و`AccountingChat.tsx` تعرض الآن `confidence` و`sources` عند توفّرها من الخادم.
- `src/services/api.ts` يعرّف الأنواع الجديدة للردود.

## 8. معيار تقييم ثابت (AI Evaluation Suite)

- `docs/ai-eval.md`: دليل التقييم، ومعايير المرور/الإيقاف.
- `scripts/evaluate-ai.ts`: 10 أسئلة ثابتة عربية + قاعدة `>= 80%`.
- النتيجة الحالية: **10/10 (100%)**.

## 9. فصل `server.ts` إلى `routes/*.ts` و`middleware/`

- `server/routes/ai.routes.ts`: كل مسارات `/api/ai/*` (استعلام، خبير محاسبي، OCR اقتراح، شذوذ، صوت، 1301، قيود معلّقة، إيصالات، دعم، تقييم، قاعدة معرفة، نية صوتية، توقعات، health).
- `server/routes/ai-core.routes.ts`: المحادثة العامة، الـ streaming، وتأكيد إنشاء/ترحيل القيد (`execute-entry`) مع `requirePermission`.
- `server/middleware/error-handler.ts`: `notFoundHandler` + `apiErrorHandler` موحّدين (404 JSON لمسارات API غير المعروفة، وأخطاء 500 آمنة في الإنتاج).

## 10. تقوية الفحص النوعي للخادم (Type-checks)

- أُصلحت أخطاء `strict` في:
  - `server/db/postgresSync.ts`
  - `server/services/csv-import.service.ts`
  - `server/services/employee-affairs.service.ts`
  - `server/services/live-agent.service.ts` (أُضيف `@types/ws`)
  - `server/services/payroll-import.service.ts`
  - `server/services/voice.processor.ts`
  - `server/utils/runtime-paths.ts`
  - `src/services/encryption.service.ts`
  - `src/types/erp.ts` (إضافة `HR_ALERT` لنوع الإشعارات)
- `tsconfig.server-check.json` المؤقت اُستخدم للتحقق النهائي ثم حُذف لعدم الحاجة إليه في البناء/التشغيل.

---

## الاختبارات

```bash
npm run build
```
- ✅ نجح بناء Vite (1726 وحدة).

```bash
npm test
```
- ✅ المحاسبة (8) + التحسينات (14) + شؤون العاملين (7) + اللائحة (8) + الحضور (7).

```bash
npx tsx scripts/evaluate-ai.ts
```
- ✅ 10/10 (100%).

### تحقق ميداني

- `GET /api/ai/global-chat/health` → `{configured, model}`
- `POST /api/ai/global-chat/stream` → بثّ `chunk` ثم `done`
- `POST /api/ai/support-question` → إجابة كاملة مع `sources/confidence`
- `GET /api/non-existing` → JSON 404 موحّد
- الخادم في وضع الذاكرة (Postgres المضمّن متوقف بسبب `libpq.so.5` — سلوك متوقع).

---

## ملاحظات

- عند ضبط `GEMINI_API_KEY` ستُستخدم النماذج + أدوات الدوال تلقائياً، وحالياً يتحقق الدعم بدون مفتاح عبر `smartAgentEnhancer`.
- ملف `tsconfig.server-check.json` المؤقت حُذف بعد اكتمال الفحص النوعي.
