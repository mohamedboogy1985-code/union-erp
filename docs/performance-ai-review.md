# مراجعة الأداء وجودة الذكاء الاصطناعي — Union Financial ERP

> **نطاق المراجعة:** كود المشروع داخل `union-2026.zip` (وهو في الواقع أرشيف `tar.gz`). تمت مراجعة أهم الملفات:
> `server.ts`، `server/services/ai.service.ts`، `server/services/reports.service.ts`، `server/services/cache.service.ts`،
> `server/services/account-query.service.ts`، `server/services/dashboard.service.ts`، `server/services/voice.processor.ts`،
> `server/services/ocr.service.ts`، `server/services/smart-agent.service.ts`، `server/data/knowledge-base.ts`،
> وواجهات `src/pages/AIAssistant.tsx`، `src/pages/AccountingChat.tsx`، `src/components/GlobalAiWidget.tsx`،
> `src/components/JournalAiAssistant.tsx`، `src/services/api.ts`.
>
> **النتيجة:** النظام جيد البنية على مستوى المزايا، لكن هناك فجوات واضحة في **التكرار الحسابي على الخادم**،
> **استخدام الكاش الضعيف**، **تشتت المساعدات الذكية**، و**غياب معايير تقييم للذكاء الاصطناعي**. ما يلي هو
> مقترحات أولوية عالية قابلة للتنفيذ خلال مراحل قصيرة.

---

## 1) الخلاصة التنفيذية

| # | الملاحظة | الأثر | الملفات |
|---|----------|-------|---------|
| 1 | التقارير تكرر عبور القيود لكل حساب (O(حسابات × قيود × سطور)) | 🔴 عالٍ | `reports.service.ts` |
| 2 | الكاش مستخدم في `dashboard` فقط، بينما التقارير وسياق الذكاء الاصطناعي تعاد حساباتها في كل طلب | 🔴 عالٍ | `cache.service.ts`, `reports.service.ts`, `ai.service.ts` |
| 3 | `server.ts` ملف ضخم (2646 سطراً) به كل نقاط API وتستخدم `accounts.find`/`filter` في حلقات كثيرة | 🟠 متوسط-عالٍ | `server.ts`, `store.ts` |
| 4 | توجد 4 واجهات محادثة ذكية بسلوكيات مختلفة وأحدها MySQL/Prisma غير موصول بالنظام الفعلي | 🟠 عالٍ | `AIAssistant.tsx`, `AccountingChat.tsx`, `GlobalAiWidget.tsx`, `JournalAiAssistant.tsx`, `src/features/ai-support-agent/*` |
| 5 | `execute-entry` لا يربط أستاذًا مساعدًا لحسابات `1301` ولا يطابق أسماء الجهات، فيُرحِّل قيودًا ناقصة | 🔴 عالٍ (جودة AI) | `server.ts` |
| 6 | الإشارة إلى Gemini تعتمد `gemini-3.7-flash`/`3.6-flash` في مواضع كثيرة، والوقت المستغرق لكل استدعاء يصل إلى 50 ثانية مع 2-3 محاولات | 🟠 متوسط | `ai.service.ts`, `GlobalAiWidget.tsx`, `AIAssistant.tsx` |
| 7 | صور OCR تُرسل كاملة كـ base64 دون ضغط/حد أقصى، ما يرفع التكلفة والزمن | 🟠 متوسط | `server.ts`, `ai.service.ts`, `AIAssistant.tsx` |
| 8 | غياب `streaming`/SSE — المستخدم ينتظر ردًا طويلًا بدون مؤشر متدرج | 🟡 متوسط | الواجهات |
| 9 | تصنيف الأسئلة والبحث في قاعدة المعرفة يعتمدان مطابقة كلمات فقط، والثقة كثيرًا ما تكون ثابتة | 🟠 متوسط | `smart-agent.service.ts` |
| 10 | `learnFromFeedback` يحفظ التقييم لكنه لا يغيّر سلوك الإجابة فعليًا | 🟡 متوسط | `smart-agent.service.ts` |

---

## 2) تحسينات الأداء

### 2.1 إصلاح خوارزميات التقارير (أعلى أثر)

**المشكلة:** `getTrialBalance` و`getIncomeExpenseReport` و`getGeneralLedger` تعبر كل قيد لكل حساب:
- عدد الحسابات الفرعية ~80+، عدد القيود قد يبلغ آلافًا، وكل قيد يحتوي سطورًا.
- النتيجة: `O(accounts × entries × lines)`، ويتكرر نفس الفلترة والتجميع في كل تقرير.

**المقترح:** نبني خريطة تجميعية واحدة لكل الحسابات ثم نقرأ كل سطر مرة واحدة.

```ts
// فكرة: تجميع أحادي العبور
function aggregateByAccount(entries, accountIds) {
  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!accountIds.has(line.accountId)) continue;
      const bucket = byAccount.get(line.accountId) ?? { debit: 0, credit: 0 };
      bucket.debit += line.debit;
      bucket.credit += line.credit;
      byAccount.set(line.accountId, bucket);
    }
  }
  return byAccount;
}
```

ثم نقرأ النتيجة في `getTrialBalance` و`getIncomeExpenseReport` و`getGeneralLedger`. هذا يخفض التعقيد إلى `O(entries × lines)` ويحافظ على نفس شكل الإخراج.

### 2.2 إضافة فهارس في الذاكرة للوصول السريع

**المشكلة:** يوجد أكثر من 56 موضع `erpStore.accounts.find/filter`، وكثير منها داخل حلقات، إضافةً إلى بحث متكرر عن القيود والأستاذ المساعد.

**المقترح:** إضافة فهارس داخل `ERPStore` تُبنى بعد البذر وتُحدَّث عند الكتابة:

```ts
private accountByCode = new Map<string, string>();
private accountById = new Map<string, string>();
private entriesByOrg = new Map<string, JournalEntry[]>();

getAccountByCode(code: string) { return this.accounts.find(a => a.code === code); }
```

**قاعدة عملية:** إن ظهر `accounts.find(...)` داخل حلقة أو في تقرير، استبدلها بفهرس أو طرف `Map`. يكفي البدء بـ:
- `accountById`
- `accountByCode`
- `subledgerByAccountId`
- `entriesByOrganizationId`

### 2.3 توسيع الكاش ليشمل التقارير وسياق الذكاء الاصطناعي

**المشكلة:** `cacheService` و`CACHE_KEYS` موجودان، لكن `cacheService.wrap` يُستخدم في `dashboard` فقط، رغم وجود مفاتيح جاهزة لـ `trialBalance` و`accountsList` و`journalTemplates`.

**المقترح:**
1. لفّ `getTrialBalance` و`getIncomeExpenseReport` كواجهات/طرق داخل `reports.service` بمفتاح يتضمن `organizationId` و`startDate`/`endDate` و`includeDrafts`.
2. في المساعد الذكي، اجمع سياقًا ماليًا واحدًا (`buildFinancialContext`) ولفّه بمفتاح `cache:ai-context:{orgId}:{dateBucket}` لمدة 30-60 ثانية.
3. أضف `cacheService.invalidatePrefix('cache:reports:*')` بعد كل قيد جديد، بما أن `invalidatePrefix('cache:')` موجودة أصلًا.

> **تنبيه:** لا تكاش بيانات حساسة للمستخدمين المختلفين؛ اجعل المفتاح يتضمن `userId` عند السياق المعتمد على المستخدم.

### 2.4 تجنب المزامنة المتكررة مع PostgreSQL

`postgresManager.persistJournalEntry` و`updateJournalEntryStatus` تُستدعى كل عملية. لبيئات الإنتاج:
- اجعل الكتابة عبر `jobs`/Queue خلف `POST` (نفس الاستجابة فورًا).
- أو حدّث محليًا ثم أرسل دفعات دورية (batch).
- بالنسبة للحال الحالي، يكفي إعادة استخدام نفس نظام الكاش وإبطال فقط عند النجاح.

### 2.5 تحسين الواجهة الأمامية

- `getJournalEntries`, `getAccounts`, `getReceipts`, `getAuditLogs` تعيد كل العناصر؛ استعمل `?page=&limit=` الموجود في `paginationService` و`/api/journal-entries` و`/api/audit-logs` فقط.
- أضف **debounce** (250-400ms) لحقول البحث و`Combobox` لتقليل الاستدعاءات.
- عطّل إعادة الجلب المتكررة عند التبويبات (في `AIAssistant`، `loadAnomalies`/`loadForecast` تُستدعى عند كل انتقال) — يكفي الجلب مرة واحدة ما لم يتغير التاريخ/البيانات.
- وحّد `fetch`/`api.request` في الملفات الثلاثة التي تستدعي `/api/ai/*` بالطريقة اليدوية — يقلل الأخطاء ويجعل الرؤوس موحدة.

---

## 3) تحسين جودة الذكاء الاصطناعي

### 3.1 مدخل واحد موحد (Single AI Gateway)

**المشكلة:** لديك أربعة “مساعدين” في الواجهة:
- `AIAssistant.tsx` → `/api/ai/query` (استدعاء `queryFinancialAssistant`)
- `AccountingChat.tsx` → `/api/ai/accountant-chat`
- `GlobalAiWidget.tsx` → `/api/ai/global-chat`
- `JournalAiAssistant.tsx` → `/api/ai/global-chat` (نفس النقطة لكن بتعبئة مختلفة)

ونقطة `/api/ai/support-question` محلية دون Gemini.

**المقترح:** وحّد `ai.service.ts` حول دالة رئيسية `chat({ message, history, orgId, mode })` تكون البوابة الوحيدة. تبقى نقاط REST للتوافق لكنها تستدعي نفس المنطق. هذا يمنع اختلاف نظام “السياق/التاريخ/البرومبت” بين الشاشات، ويسمح بتطبيق التقييم والكاش في مكان واحد.

### 3.2 توحيد أدوات Function Calling وRAG

**حاليًا:**
- `globalAssistantChat` وحدها تستخدم `Function Calling` وتقوم بإنشاء قيد، استعلام بيانات، ترحيل.
- `queryFinancialAssistant` و`chatWithAccountantExpert` و`parseVoiceDictation` تستدعي Gemini مباشرة ببرومبت نصي دون أدوات، ما يزيد احتمال التخمين.

**المقترح:**
1. اجعل `queryFinancialAssistant` و`chatWithAccountantExpert` تستخدمان `query_erp_data` للحصول على الأرقام الفعلية دائمًا.
2. أضف أداة `lookup_accounts` تستقبل كلمات عربية وتعرض أفضل 5 حسابات ذات صلة (من فهرس دليل الحسابات + قاعدة أنماط المعرفة) — حتى لا يختار النموذج حسابًا خاطئًا.
3. أضف `responseSchema` (أو `responseMimeType + responseJsonSchema`) واستخدم `zod`/`JSON.parse` للتحقق، ولا تعتمد على `response.text || '{}'`.
4. مارس فحصًا صارمًا بعد إرجاع النموذج:
   - كل خط يجب أن يحتوي `accountCode` حقيقيًا.
   - مجموع `debit == credit`.
   - `date` ضمن فترة مفتوحة.
   - لأي حساب `requiresSubledger`، يجب أن يحتوي `partyName`/`subledgerPartyName` وإلا أعد القيد.

### 3.3 معالجة القيد المُقترح (`execute-entry`) — **أهم إصلاح جودة**

**الخلل الحالي:** `execute-entry` يبحث عن الحساب بالكود، ثم ينشئ `lines` بـ `accountId` فقط، دون تمرير اسم الطرف لـ `subledgerPartyNameInput`. لذلك:
- قيد على `1301` يقبل الترحيل بدون اسم الجهة إلا إذا كان يحتوي `subledgerPartyId` (وهي غير موجودة من AI).
- وهذا يخالف “إلزامية الأستاذ المساعد” في `accounting.service.createJournalEntry`.

**المقترح:**

```ts
const lines = proposedEntry.lines.map((l: any) => {
  const acc = erpStore.accounts.find((a) => a.code === String(l.accountCode));
  if (!acc) throw new Error(...);
  const sub = acc.requiresSubledger || acc.code === '1301';
  return {
    accountId: acc.id,
    subledgerPartyNameInput: sub ? String(l.partyName || l.subledgerPartyName || l.description || '') : undefined,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    description: l.description || proposedEntry.description || '',
  };
});
```

ثم دع `createJournalEntry` يتكفل بالعثور/إنشاء الطرف وإضافة تحذير التشابه.

### 3.4 إعداد سياق ذكي قابل للتكرار (Context Builder)

حاليًا السياق يُبنى في أكثر من طريقة:
- `queryFinancialAssistant`
- `chatWithAccountantExpert`
- `globalAssistantChat`

اجعل دالة وحدة:

```ts
function buildSystemContext(orgId, mode) {
  // دليل الحسابات النشط + الميزان + الإيرادات/المصروفات + 1301 + آخر إيصالات + اللائحة
}
```

**إرشادات البرومبت:** وحّد لغة التعليمات، واستخدم قسمًا واضحًا باسم "الحقائق المعطاة" ثم "القواعد" ثم "الأفعال المسموحة". أضف تعليمات صريحة: *"لا تخترع أسماء جهات أو أرصدة؛ إن لم تجدها قل ذلك"*.

### 3.5 معالجة استهلاك/تأخير Gemini

- **مهلة أقل:** 50 ثانية لكل محاولة طويلة جدًا؛ اجعلها `20-25s` حسب أولوية الطلب.
- **Retry بشكل متوازٍ:** لا حاجة لمحاولتين متتاليتين دائمًا؛ حاول النموذج الأسرع ثم الأحتياطي فقط عند `500/503/429`.
- **Streaming:** استخدم `gemini.streamGenerateContent` أو `SSE` ليكون المستخدم يشاهد النص. إن لم يتوفر، أضف placeholder “أفكار أُعدّت” يشير إلى تحليل مبدئي.
- **Health:** نقاط `/health` تعيد اسم نموذج واحد، اجعلها تعيد `models[]` من نفس مصدر `GLOBAL_MODELS` وليس نصًا مكتوبًا.

### 3.6 تقييد صورة OCR

`handleOCRImageChange` كان يقرأ الصورة كاملة. أضف:
- حد أقصى للـ **ميجا بكسل** (مثال: أعد ضغطها إلى عرض 1600px و JPEG جودة 80).
- حد للـ base64 (مثال 8MB).
- تحقّق من نوع الملف ورفض غير المسموح.
- في `parseSlipAndSuggestJournal` مرّر `imagePart` بأقل حجم ممكن.

### 3.7 تحسين البحث والمعرفة العربية

- `smartAgentEnhancer.searchKnowledgeBase` يعتمد `normalized.includes` فقط. أضف:
  - قاموس مترادفات محاسبي (مصروفات، مشتريات، مستلزمات، توريدات...).
  - مطابقة “نسبة تشابه” (`calculateSimilarity`) للنصوص القصيرة.
  - تقسيم النص عربي (إزالة الهمزات/الواو/الباء) مفيد، لكنه لا يغطي اللهجة المصرية العامية اكتب “مطلوب/مطلوبة/مستحقة”.
- **الثقة:** اجعل الثقة مشتقة من عدد المصادر ومن قوة المطابقة، بدل قيم ثابتة مثل `0.85`/`0.92`.
- فعّل حلقات التعلم فعليًا: على تقييم وفقًا للفئة/الكلمات المفتاحية، رتّب نتائج القاعدة، وأعد ترتيب `searchKnowledgeBase` حسب التقييم.

### 3.8 كشف الشذوذ (تحسين الدقة)

الفحص الحالي:
- `OFF_HOURS_POSTING` يستخدم ساعات UTC (06:00–18:00) وهذا يسبب نتائج خاطئة في مصر (UTC+2/+3). اجعل الفحص حسب توقيت القاهرة:
  ```ts
  const hour = new Date(new Date(e.createdAt).getTime() + 2 * 60 * 60 * 1000).getUTCHours();
  ```
- القيم الحدية `35000`, `40000`, `5000` صُلّبت. اجعلها من `process.env` أو من `runtime-config.ts`.
- مربع `DUPLICATE_AMOUNT` لا يفحص نفس الطرف/نفس الفترة، أضف same-party + same-store/شركة + نفس الشيك.
- أضف سجلات `firstSeenAt`/`lastSeenAt` لتجنب تكرار الإنذارات كل مرة.

### 3.9 حذف/توحيد `src/features/ai-support-agent`

- هذا المسار غير موصول بالخادم (لا يوجد `app.use` له ولا استيراد).
- يستخدم `new PrismaClient()` عند التحميل، وهو غير مناسب لبيئة `erpStore` الذاكرة الحالية، وقد يفشل إذا لم توجد قاعدة بيانات.
- **اقتراح:** إما حذفه، أو إعادة استخدامه كواجهة انتشار سحابي تتشارك نفس `smartAgentEnhancer` و`accountQueryService` بدل خدمة DB مستقلة.

### 3.10 تقييم الجودة (لا تقيس ما لا تراه)

أنشئ `docs/ai-eval.md` مع مجموعة أسئلة ثابتة (20-30 سؤالًا):
- أرصدة 1301
- حدود اللائحة (م9، م37، م39/40، م50/51، م61)
- إنشاء قيد مصروف/إيراد
- أخطاء شائعة
- فصل المهام

وقيّم يدويًا بـ 0/1 (صحيحة/خاطئة) أو درجة 1-5. أعد تشغيلها بعد كل تعديل على البرومبت/الأدوات. هذا أهم من أي كود لضمان تحسن فعلي.

---

## 4) خطة تنفيذ مقترحة (بالأولوية)

### المرحلة 0 — سريعة (يوم فني)
- [ ] إصلاح `execute-entry` لربط الأستاذ المساعد.
- [ ] ضغط/تقييد صورة OCR.
- [ ] توحيد `GLOBAL_MODELS` ومهلة الاستدعاء.
- [ ] إضافة فهارس `accountByCode/accountById` في `store.ts`.
- [ ] كاش `getTrialBalance`/`getIncomeExpenseReport`.

### المرحلة 1 — الأثر المتوسط (أسبوع)
- [ ] خوارزمية التقارير أحادية العبور.
- [ ] إضافة `query_erp_data`+`lookup_accounts` لكل مسارات AI.
- [ ] مدخل موحد `chat()` + تحقق من المخطط بعد Gemini.
- [ ] نقل الكاش إلى سياق AI.
- [ ] توحيد الواجهات (`AIAssistant`, `GlobalAiWidget`, `JournalAiAssistant`) حول مكوّن `AiChatPanel`.
- [ ] توسيع التعليق الزمني لكشف الساعات المصرية.

### المرحلة 2 — مستدامة (2-3 أسابيع)
- [ ] Retriever دلالي (Embeddings اختياري) أو قاموس مترادفات عربي موسّع.
- [ ] Streaming/SSE للمحادثة.
- [ ] حلقة تقييم `docs/ai-eval.md` + قواعد تمرير/إيقاف.
- [ ] تتبع شفافية AI (بأي مصدر أُجيبت؟) وإظهار `confidence` و`sources` في الواجهة.
- [ ] تقسيم `server.ts` إلى `routes/*.ts` + `middleware/error-handler.ts`.

---

## 5) ملاحظات تقنية إضافية

1. **الأرشفة:** `union-2026.zip` عبارة عن `gzip` وليس `zip` حقيقي (`gunzip` ينتج `tar`). أمر `unzip` الحالي يفشل. للعمل على الكود من بيئات التنفيذ يجب استخراجه أولًا:
   ```bash
   gunzip -c union-2026.zip > union-app.tar
   tar -xf union-app.tar
   ```
   أو أعد توليد الأرشيف بالصيغة الصحيحة (`zip`/`.tar.gz`) لتسهيل الفتح.

2. **الاختبارات الموثقة:** `package.json` يشغّل `tsx test/...` ولا يشغّل `jest`. ملفات `__tests__/*.ts` تحت `src/features/ai-support-agent` و`src/services/__tests__` ليست في مسار الاختبار الفعلي. فعّل الاختبارات ذات المعنى فقط.

3. **جودة الكود:** `server.ts` يحتوي تعليقات وإعادة استخدام كثيرة، لكنه يفتقر إلى طبقة `routes/`/`validation/`. التوسع سيجعله صعب الصيانة.

4. **تشكيلة الحزم:** `@google/genai` إصدار حديث؛ تحقق أن دالة `generateContent` تنعكس مع اسم النموذج الحالي في `GLOBAL_MODELS`. لا تعتمد على اسم ثابت في الواجهات.

---

## 6) الملخص النهائي

| المحور | أفضل 3 إجراءات |
|--------|----------------|
| **الأداء** | 1) إصلاح التقارير أحادية العبور 2) فهارس `accountByCode/accountById` 3) كاش التقارير وسياق AI |
| **جودة AI** | 1) ربط الأستاذ المساعد في `execute-entry` 2) توحيد البوابة + Function Calling + تحقق المخطط 3) إضافة قاعدة تقييم ثابتة |
| **تجربة المستخدم** | 1) Streaming/SSE أو مؤشرات تحسينية 2) توحيد الواجهات في مكوّن واحد 3) debounce/بحث بفهارس |
| **الصيانة** | 1) تقسيم `server.ts` 2) حذف/ربط `ai-support-agent` الميت 3) تحسين CI للاختبارات الفعلية |

> **التوصية التنفيذية:** ابدأ بالمرحلة 0 (أثر سريع وأمان محاسبي أعلى)، ثم المرحلة 1، ثم قيّم المعايير قبل الشروع في تحسينات RAG/Embedding.
