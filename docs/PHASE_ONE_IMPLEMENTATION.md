# تنفيذ المرحلة الأولى — تحسين الأداء وجودة الذكاء الاصطناعي

> **التاريخ:** 2026-08-31
> **التقرير المرجعي:** `docs/performance-ai-review.md` (في جذر المستودع)
> **الهدف:** تطبيق التحسينات سريعة الأثر (Phase 0) التي أُثبتت مراجعةً أنها الأكثر جدوى.

---

## ما تم تنفيذه

### 1) إصلاح مسار ترحيل قيد المساعد الذكي (`server.ts`)
- **المشكلة:** `POST /api/ai/execute-entry` كان ينشئ القيد كمسودة ثم يستدعي `postJournalEntry` مباشرة، فيفشل لأن الحالة ليست `APPROVED` (والمستخدم هو نفسه منشئ القيد).
- **الحل:**
  - بعد تأكيد المستخدم على المسودة المُولّدة من الذكاء الاصطناعي، يُسجَّل القيد كـ `APPROVED` آليًا مع سجل تدقيق `AI_ENTRY_AUTO_APPROVED`.
  - يُرحَّل القيد بعد الاعتماد الآلي.
  - يبقى فصل المهام (SoD) ساريًا في كل المسارات اليدوية الأخرى.
- **النتيجة:** يمكن الآن تنفيذ قيد مقترح من `GlobalAiWidget`/`JournalAiAssistant` بنجاح.

### 2) ربط الأستاذ المساعد لحسابات `1301`/التحليلية (`server.ts`)
- **المشكلة:** القاعدة المحاسبية تلزم بتحديد اسم الجهة/الشخص عند الترحيل على حسابات `requiresSubledger`، لكن مسار الذكاء الاصطناعي لم يُمرر هذا الاسم.
- **الحل:** عند ترجمة سطور القيد المقترح، نقرأ `partyName` أو `subledgerPartyName` أو `subledgerPartyNameInput` أو `description` كبيان تحليلي، ونمرره إلى `subledgerPartyNameInput`. ثم تتولى `AccountingService` إنشاء/إيجاد حساب الأستاذ المساعد تلقائيًا مع تحذير التشابه.
- **النتيجة:** القيد المُرحَّل على `1101` (مدينون متنوعون بالدليل الموحد) يعود بخط `subledgerPartyId` و`subledgerPartyName` حقيقيين.

### 3) فهارس حسابية في الذاكرة (`server/db/store.ts`)
- **أُضيفت:**
  - `accountIndex` (بالمعرف)
  - `accountCodeIndex` (بالكود)
  - `subledgerByAccountIndex` (بالحساب الأم)
  - دوال `getAccountById`, `getAccountByCode`, `getSubledgerPartiesForAccount`, `rebuildAccountIndexes`.
- **الفائدة:** تقليل البحث الخطي المتكرر في `accounts` و`subledgerParties` داخل الخدمات الساخنة (`accounting.service`, `ai.service`, `dashboard.service`), خاصة مع دليل موحّد يضم مئات الحسابات.
- **الاستخدام المحدّث:**
  - `accounting.service.createJournalEntry`
  - `ai.service` (ربط الحسابات من أدوات Gemini + رصد 1301)
  - `dashboard.service` (مخططات الإيرادات/المصروفات)
  - `account-query.service` (أطراف حساب 1101/1301)

### 4) تقارير أحادية العبور مع كاش (`server/services/reports.service.ts`)
- **المشكلة:** `getTrialBalance`, `getIncomeExpenseReport`, `getGeneralLedger` كانت تعبر القيود مرة لكل حساب → `O(accounts × entries × lines)`.
- **الحل:** دالة `aggregateByAccount()` تُجمّع كل سطر مرة واحدة فقط، ثم تُبنى التقارير من الخريطة.
- **الكاش:**
  - أُضيف `getSync/wrapSync/setSync` إلى `cache.service.ts`.
  - أصبحت التقارير الثلاثة تُكاش بمفاتيح تشمل `organizationId + includeDrafts + startDate + endDate` لمدة 60 ثانية.
  - أُضيفت مفاتيح `CACHE_KEYS.incomeExpense`, `generalLedger`, `financialSnapshot`, `aiFinancialContext`.
- **ملاحظة:** الإبطال عند الكتابة يستخدم `invalidatePrefix('cache:')` الموجود أصلاً، فيؤثر على كل التقارير تلقائيًا.

### 5) كاش التقطيع المالي للمساعد (`server/services/account-query.service.ts`)
- `getFinancialSnapshot` أصبح مكاشًا لمدة 30 ثانية، ويُبنى من التقارير المكاشة نفسها، فلا يتكرر الحساب في كل طلب AI.

### 6) توحيد النموذج ومهلة Gemini (`server/services/ai.service.ts`)
- أُضيفت الثوابت:
  - `AI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash']`
  - `AI_PRIMARY_MODEL`
  - `AI_REQUEST_TIMEOUT_MS = 25s` (قابلة للضبط عبر env)
- استُبدلت كل أسماء النماذج المضمّنة بـ `AI_PRIMARY_MODEL`، والمهلة الطويلة `50s` أصبحت `AI_REQUEST_TIMEOUT_MS`.
- `/api/ai/global-chat/health` يعيد النموذج من نفس المصدر.

### 7) ضبط صور OCR وحجمها (`server/services/ai.service.ts` + `src/pages/AIAssistant.tsx`)
- **الخادم:** حد `MAX_OCR_IMAGE_BYTES` (افتراضي 8 م.ب) يرفض الصور الأكبر قبل إرسالها إلى Gemini.
- **الواجهة:** عند رفع صورة، تُضغط تلقائيًا إلى JPEG بدقة أقصى عرض 1600px وجودة 0.82 عبر Canvas، مع رفض الملفات الأكبر من 8 م.ب.
- **الفائدة:** تقليل زمن الاستجابة وتكلفة API مع تحسين دقة OCR للصور الكبيرة.

### 8) إصلاح ساعات اكتشاف الشذوذ (`server/services/ai.service.ts`)
- **المشكلة:** الفحص كان يستخدم `UTCHours` مع افتراض أوقات العمل، ما يسبب إنذارات خاطئة في مصر (UTC+2/+3).
- **الحل:** التحويل إلى توقيت القاهرة (UTC+2) قبل فحص الساعة، مع نطاق 06:00–21:00 بتوقيت القاهرة.

---

## الاختبارات

### بناء الواجهة
```bash
npm run build
```
- ✅ نجح بناء Vite (1726 وحدة، 3.7s).
- تحذير من حجم chunk (`737 kB`) موجود مسبقًا، ليس نتيجة التغييرات.

### الاختبارات الآلية
```bash
npm test
```
- ✅ قوائم المحاسبة (8)
- ✅ التحسينات (14)
- ✅ شؤون العاملين (7 مهام، 76 عاملاً)
- ✅ اللائحة المالية (8 مهام)
- ✅ الحضور والانصراف (7 مجموعات)

### التحقق ميدانيًا
تم تشغيل الخادم بوضع `production`:
```
🏛️ Union Financial ERP Server running on http://0.0.0.0:3000
📌 تحميل دليل موحد: 117 حسابًا + 3083 قيدًا + 76 عاملاً
```

- `GET /api/reports/trial-balance` — يعمل مع الكاش الجديد.
- `POST /api/ai/global-chat/health` — يعيد `{"model":"gemini-3.7-flash"}`.
- `POST /api/ai/execute-entry` — ✅ نجح إنشاء وترحيل قيد على حساب `1101` مع:
  - `subledgerPartyId` و `subledgerPartyName` حقيقيين جديدين.
  - تحذير: `"تم إنشاء كشف حساب أستاذ مساعد جديد للطرف برقم [DEBT-XXX]"`.

---

## الملفات المعدلة

| الملف | التغيير |
|-------|---------|
| `server/db/store.ts` | فهارس `Map` + دوال بحث وبذاء |
| `server/services/cache.service.ts` | `getSync/setSync/wrapSync` + مفاتيح تقارير |
| `server/services/reports.service.ts` | تجميع أحادي العبور + كاش 60s |
| `server/services/account-query.service.ts` | كاش `financialSnapshot` + فهرس 1301 |
| `server/services/dashboard.service.ts` | استخدام فهرس الحسابات والأستاذ المساعد |
| `server/services/ai.service.ts` | نموذج/مهلة موحدة + فهارس + حد OCR + توقيت القاهرة |
| `server.ts` | `execute-entry`: ربط أستاذ مساعد + اعتماد/ترحيل آلي للذكاء الاصطناعي + model health |
| `src/pages/AIAssistant.tsx` | ضغط/تقييد صورة OCR قبل الرفع |

---

## التحسينات المتبقية (المرحلة اللاحقة)

- توجيه مسارات كل مساعدات المحادثة عبر مدخل موحد (AI Gateway).
- إضافة `responseJsonSchema`/تحقق المخطط بعد كل إجابة Gemini.
- تبديل سياق AI إلى `query_erp_data` + أداة `lookup_accounts` لجميع المسارات.
- دمج أو حذف `src/features/ai-support-agent` الميت.
- تقييم معياري ثابت `docs/ai-eval.md` قبل اعتماد أي تغيير برومبت.
- تقسيم `server.ts` إلى `routes/*.ts` + middleware مخصص.
