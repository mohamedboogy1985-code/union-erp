# مراجعة الـ Pull Requests المغلقة دون دمج — Union ERP

> **التاريخ:** 2026‑09‑28 • **الفرع:** `arena/01a0e7c8-union-erp` • **الأساس:** `main` @ `11c4abc`
> **المستودع:** `mohamedboogy1985-code/union-erp`
> **الهدف:** التأكد من أن كل PR أُغلق دون دمج **لم يفقد عملاً فعلياً**، وتحديد ما فُقد بالفعل وإصلاحه.

## 1) الملخص التنفيذي

أُغلقت أربعة Pull Requests دون دمج: **#19، #20، #24، #26**. التحقق الكامل (لا العيّني) أظهر:

| PR | العنوان | سبب الإغلاق المعلن | نتيجة التحقق | عمل مفقود فعلياً |
|---:|---|---|---|---|
| **#19** | `ci: add GitHub Actions workflow for automated test suite` | «الفكرة جيدة لكن الـ PR ملوّث بترقية `vite` الرئيسية إلى `^8.2.2`… سيُستبدل بـ workflow نظيف» | ✅ **صحيح** — الـ workflow موجود على `main` بنسخة أحدث، وترقية `vite` رُفضت عن قصد و`main` لا يزال على `^6.4.3` | لا شيء |
| **#20** | `Integrate Google Jules AI coding agent` | «متقادم… تكامل Jules يحتاج إعادة نظر على الكود الحالي» | ✅ **صحيح** — كل الأسطر المُضافة موجودة على `main` (12 ملفاً متطابق بايت‑ببايت، والباقي مُعاد هيكلته) عبر PR #22 | لا شيء |
| **#24** | `Arena/01a0735f union erp` | **لا يوجد تعليق إغلاق** (أُغلق 2026‑09‑17 19:51) | ❌ **الفرع أُعيد كتابته** وضاعت موجة كاملة من العمل | ⚠️ **38 ملفاً** + موجة تحسينات مسارات/أمن/مراقبة لم تدخل `main` أبداً |
| **#26** | `Integration/full latest` | «الفرق المحتوي = **صفر ملفات** … لا يوجد أي عمل ضائع» | ❌ **مُفنَّد** — الفرق الفعلي **112 ملفاً** من `main`، و74 ملفاً من نقطة التفرّع، والمفقود مؤكَّد بالأدلة | ⚠️ **تغيير إنتاجي** (سقف استجابة Jules) + **نظام المهارات الموحد** + شاشات ومزايا (الفصل 6) |

**الإجراء في هذه الجلسة:** استُعيد السقف المفقود (`4 MiB → 16 MiB` في `server/services/jules.service.ts`) وأُضيف اختبار حدّي يغطي القبول عند الحد وإلغاء البث عند تجاوزه — **39 اختبار Jules ناجح، 0 فاشل، وفحص أنواع الخادم نظيف**.

**المتبقي:** المخزون الكامل في الفصل 8 (مُصنَّف حسب التبعيات والمخاطر، مع أوامر الاستعادة). العمل كله لا يزال متاحاً في مراجع `refs/pull/*/head` غير القابلة للتغيير.

---

## 2) المنهجية

المراجعة الأولى (جلسة سابقة) لم تكن شاملة لأن «بعض كائنات التاريخ القديم غير متاحة محلياً» — كان المستودع استنساخاً سطحياً (`depth=1`) وفرعا `integration/full-latest` و`arena/01a0735f-union-erp` لم يعودا يحملان الكوميتات الأصلية. في هذه الجلسة:

1. **إزالة السطحية:** `git fetch --unshallow origin` → تاريخ كامل (105 كوميتات).
2. **جلب رؤوس PRs المغلقة:** `git fetch origin refs/pull/<n>/head:refs/remotes/origin/pr-<n>` — مراجع **غير قابلة للتغيير**، بخلاف الفروع:
   - `refs/heads/integration/full-latest` → **محذوف** من المستودع البعيد.
   - `refs/heads/arena/01a0735f-union-erp` → أُعيد كتابته إلى `da50eb1` (النسخة المصغّرة المدموجة في PR #35)، وليس كوميت PR #24 (`046486a`).
3. **المقارنة الصحيحة:** كل PR يُقارن مع **نقطة تفرّعه** `git merge-base main <pr-head>` وليس مع `main` الحالي. مقارنة PR قديم بـ `main` مباشرة تُظهر آلاف الأسطر «المفقودة» ظلماً، لأنها في الحقيقة تقدّم `main` اللاحق (ولهذا أعطى `git diff --name-only` في PR #26 رقم 112 بدل صفر).
4. **قياس التغطية:** لكل ملف ولكل PR حُسبت نسبة الأسطر المُضافة التي ما زالت موجودة حرفياً في `main`، ثم استُخرجت «الرموز المميزة» (أسماء دوال، مسارات API، وسوم واجهة، نصوص عربية) والغائبة عن `main` للتحقق الدلالي.
5. **قراءة يدوية** لكل ملف غامض: هل دلالة التغيير موجودة في `main` بصيغة أخرى؟ (مثال: `handlePrint` في `Journal2024Viewer` مفقود كزرّ، لكن مكوّن `PrintHeader` نفسه موجود على `main` ويُستخدم في ثلاث شاشات أخرى.)

> **حدود المنهجية:** مقاييس التغطية تخدم الفرز؛ الأحكام النهائية مبنية على قراءة الفروق سطراً بسطر وعلى فحص وجود الرموز الدلالية. الملفات الثنائية (صور/شعارات) لا تشملها المقاييس النصية.

---

## 3) PR #19 — `ci: add GitHub Actions workflow for automated test suite` ✅ إغلاق صحيح

- **الرأس:** `2911b20` • **نقطة التفرّع:** `716e229` • 3 كوميتات • 4 ملفات.
- **سبب الإغلاق (منشور):** الفكرة جيدة، لكن الـ PR ملوّث بترقية `vite` من `^6.4.3` إلى `^8.2.2` (ترقية رئيسية قد تكسر `@tailwindcss/vite`)، وسيُستبدل بـ workflow نظيف.

| الملف | الحالة على `main` |
|---|---|
| `.github/workflows/test.yml` | موجود ومُحدَّث: `actions/checkout@v5` و`setup-node@v5` + خطوة `test:voice-reply` + فحص حزمة الخادم (`build:server` + `smoke-server-bundle.mjs`) — نسخة **أقوى** من نسخة الـ PR (تغطية 88% من الأسطر المضافة، والباقي ترقية إصدارات) |
| `package.json` / `package-lock.json` | ترقية `vite` **غير موجودة**؛ `main` على `^6.4.3` — الرفض متعمَّد ومتوافق مع سبب الإغلاق |
| `vite.config.ts` | لا تغييرات مطلوبة |

**النتيجة:** لا عمل مفقود. السبب المعلن مطابق للنتيجة.

---

## 4) PR #20 — `Integrate Google Jules AI coding agent` ✅ إغلاق صحيح

- **الرأس:** `2a7040f` • **نقطة التفرّع:** `716e229` • كوميت واحد • 24 ملفاً.
- **سبب الإغلاق (منشور):** متقادم (8 سبتمبر)؛ الكوميتات محفوظة في `refs/pull/20` ويمكن إعادة فتحه.

**التحقق:** 12 ملفاً **متطابق بايت‑ببايت** مع `main`، منها الحساسة: `src/services/jules-api.ts`، `src/utils/jules.ts`، `src/types/jules.ts`، `test/jules.test.ts`، `docs/JULES.md`، `server/routes/jules.routes.ts`. الـ 12 الباقية تطوّرت على `main` لاحقاً لكنها تحمل التغييرات الدلالية نفسها:

| ملف | ملاحظة التحقق |
|---|---|
| `server.ts` / `server/security/middleware.ts` | `configureAdminCredentials` و`configureUserCredentials` مستوردتان؛ ومنطق `activeUserId` لمسارَي `/api/jules` و`/api/operator-assistant` موجود بصيغة موسّعة |
| `src/components/Layout.tsx` | تمييز قسم الذكاء الاصطناعي (`isAi`) موجود، وأُضيف إليه `aetherswarm` |
| `package.json` | `test:jules` و`typecheck:jules` موجودان، وسكربت الاختبارات على `main` أوسع |
| `.env.example`، `README.md`، `docs/API.md`، `scripts/hash-password.mjs`، `src/App.tsx`، `src/config/portals.ts`، `src/services/api.ts`، `server/security/admin-credentials.ts` | تغطية 100% للأسطر المضافة |

**النتيجة:** لا عمل مفقود. تكامل Jules الحالي يساوي ما جاء في الـ PR أو يتجاوزه (أُعيد تطبيقه عبر PR #22/#27).

---

## 5) PR #24 — `Arena/01a0735f union erp` ❌ موجة عمل كاملة مفقودة

- **الرأس:** `046486a` • **نقطة التفرّع:** `cf1e714` • 8 كوميتات • 61 ملفاً • `+6282/−925`.
- **سبب الإغلاق:** **لا يوجد أي تعليق** على GitHub. الفرع أُعيد كتابته لاحقاً ودُمجت منه نسخة مصغّرة كإصلاح أمني (PR #35 ← `da50eb1`)، فسقط الباقي.
- **تحقق الأبوّة:** `38ad140` و`374eeab` و`046486a` كلها **ليست أسلافاً لـ `main`**، ولا كوميت من كوميتاتها الثمانية على `main`. ولا يوجد أي فرع بعيد يحملها عدا `refs/pull/24/head`.
- **الملفات الغائبة:** 38 ملفاً • **دلتا `server.ts`:** 223 سطراً • **دلتا الواجهات:** 5 ملفات.

### 5.1 ما فُقد (بأدلة قابلة للتحقق)

| # | العمل المفقود | الأدلة |
|---|---|---|
| 1 | **تفكيك مسارات API + ترقيم صفحات + بحث + فحص صلاحيات + تفريغ كاش**: `chart-of-accounts.routes.ts`، `subledger.routes.ts`، `receipts-members.routes.ts`، `system.routes.ts` (271 سطراً)، `ai-gateway.routes.ts` | المسارات موجودة على `main` **معالجات مضمّنة** في `server.ts` تُعيد المصفوفة كاملة؛ مثال: `app.get('/api/accounts', … res.json(erpStore.accounts))` بلا ترقيم |
| 2 | **طبقة RAG دلالي**: `server/services/embedding.service.ts` (394 سطراً) + `/api/ai/rag/search` + `scripts/seed-rag.ts` + هجرة pgvector | لا أثر لـ `embedding`/`pgvector`/`rag` في `main` إطلاقاً (صفر تطابق) |
| 3 | **بوابة AI موحّدة + SSE**: `/api/ai/gateway/chat`، `/api/ai/stream`، `/api/ai/lookup-accounts`، `/api/ai/query-erp`، `/api/ai/reports/:action`، `/api/ai/eval/status` | صفر تطابق في `server.ts` و`server/routes/*` على `main` |
| 4 | **مراقبة وصحة**: `/api/system/metrics`، `/api/system/health-detailed`، `/api/system/mv/status`، `/api/system/rag/*`، `/api/system/openapi.json`، `docs/OPENAPI.md`، `monitoring/prometheus.yml`، `monitoring/grafana/*` | صفر تطابق؛ لا يوجد أي ملف رصد على `main` |
| 5 | **تسجيل الطلبات (pino)**: `server/middleware/logger.ts` (33 سطراً) وسلكه في `server.ts` | الحزمة `pino` **موجودة كتبعية غير مستخدمة** في `package.json` — أثر مباشر للعمل المفقود |
| 6 | **تقوية DoS + ضغط الاستجابات**: `compression({ threshold: 1024 })` وتقليل `express.json` من `250mb` إلى `50mb` وإضافة `express.urlencoded({ limit: '50mb' })` | `main` لا يزال على `express.json({ limit: '250mb' })` وبلا `compression` — **بند أمني** |
| 7 | **هجرات SQL**: `001_financial_numeric_fix.sql`، `002_performance_indexes.sql`، `003_rls_and_materialized_views.sql`، `004_pgvector_embeddings.sql` | `server/db/migrations/` غير موجود؛ (ملاحظة: `main` يملك `server/db/pg-schema.sql` بأعمدة `numeric(18,2)` بالفعل ضمن مسار مختلف) |
| 8 | **توسيع قاموس مترادفات المحاسبة** في `smart-agent.service.ts`: من 7 مجموعات إلى **25 مجموعة / 150+ مرادف** (RAG بدون embeddings) | 32 من 33 رمزاً مميزاً غائبة عن `main`؛ الملف موجود لكن بخريطة المجموعات القديمة |
| 9 | **اختبارات E2E وقياس حمل وأدوات**: `playwright.config.ts`، `e2e/union-erp.spec.ts`، `scripts/load-test.k6.js`، `scripts/compress-assets.ts` | غير موجودة؛ ولا تبعيات playwright/k6 على `main` |
| 10 | **مستندات**: `docs/OPENAPI.md` (66)، `docs/PRODUCTION_GUIDE.md` (120)، `docs/AUDIT_REPORT_2026.md` (735) | غير موجودة |
| 11 | **صور/شعارات مضغوطة**: 9 ملفات `.webp/.optimized.png` | غير موجودة |

> **مُستبدَل وليس مفقوداً:** `scripts/evaluate-ai.ts` و`docs/ai-eval.md` — `main` يملكهما بنسخة لاحقة (10 حالات ذهبية تعمل بلا مفتاح API)، فلم يُحتسبا فقداً.

---

## 6) PR #26 — `Integration/full latest` ❌ تعليل الإغلاق مُفنَّد

- **الرأس:** `9e81760` • **نقطة التفرّع:** `1f4f8a7` • 22 كوميتاً • 76 ملفاً • `+9329/−2320`.
- **تعليل الإغلاق المنشور (2026‑09‑17):** «الفرق المحتوي بين `integration/full-latest` و`main` هو **صفر ملفات** (`git diff --name-only` = 0) … لا يوجد أي عمل ضائع».

**التحقق الفعلي:**

```
$ git diff --name-only HEAD 9e81760 | wc -l
112
```

أغلب هذه الـ 112 هي تقدّم `main` اللاحق (وهذا بالضبط سبب فشل الطريقة المستخدمة في التحقق القديم). القياس الصحيح من `1f4f8a7`: **76 مساراً** (74 معدّلاً/مضافاً + ملفان محذوفان: `dev_server.log` و`src/pages/PromoShowcase.tsx`)، ومن الـ 74: **43 متطابقة بايت‑ببايت ✅**، و4 غائبة عن `main`، و27 متطوّرة — وبفحص الرموز الدلالية يظهر أن **معظم** المتطوّرة وصل فعلاً (مثل `electron/main.cjs`، `test/operator-assistant-ui.test.tsx`، سكربتات `package.json`، `server/security/middleware.ts`)، لكن **الباقي مفقود فعلاً**:

### 6.1 تغيير إنتاجي مفقود (سقف استجابة Jules) — ✅ استُعيد

```
$ git diff --stat HEAD 9e81760 -- server/services/jules.service.ts
 server/services/jules.service.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

-const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
+const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
```

هذا الفرق الواحد كان **العائق الوحيد** في `jules.service.ts` بين `main` والـ PR. والأثر عملي لا تجميلي: Jules يعيد سجل الجلسة كاملاً (خطط + patches + مخرجات اختبارات) في استجابة واحدة؛ فسقف 4 MiB كان يجعل الجلسات الطويلة تُرفض كـ `JULES_INVALID_RESPONSE` (502)، وعند الطلب الكتابي يُوسم الخطأ `outcomeUnknown = true` فيتعطّل إعادة الإرسال حتى المراجعة اليدوية. وقد كان رفع السقف إلى 16 MiB مُعلناً في وصف الـ PR نفسه («Jules response size cap raised from 4MB to 16MB»). التفاصيل في الفصل 7.

### 6.2 مزايا وشاشات مفقودة

| # | العمل المفقود | الأدلة |
|---|---|---|
| 1 | **نظام المهارات الموحد (كامل — Full Stack)** | 17 مسار REST مضافة في `server.ts` (`/api/skills`، `/api/skills/summary`، `/api/skills/:id`، `/api/employee-skills*`، `/api/training-programs`، `/api/training-enrollments*`، `/api/ai-agent-skills*`، `/api/accounting-procedures*`) — **صفر منها على `main`**؛ 12 مساراً في `src/services/api.ts`؛ 6 كيانات في `src/types/erp.ts`؛ كتالوج/بيانات أولية في `server/db/store.ts` (68 رمزاً مميزاً غائباً)؛ شاشة `src/pages/SkillsHub.tsx` (525 سطراً)؛ مدخل تنقل في `src/config/portals.ts`؛ مسار في `src/App.tsx` |
| 2 | **تبويب «نظرة عامة — AI Agent المتكامل»** | `src/pages/AiAgentOverview.tsx` (358 سطراً) + تبويب افتراضي في `src/pages/AiHub.tsx` + `docs/AI_AGENT_OVERVIEW.md` (150 سطراً — مستند تأكيد القدرات الأربع، مختلف عن `docs/AI_AGENT_AUDIT.md`) |
| 3 | **رسالة الترحيب الذكية عند اختيار البوابة** | `src/components/PortalWelcome.tsx` (151 سطراً) + ربطه في `src/App.tsx` — لا بديل على `main` |
| 4 | **تصدير CSV حقيقي في تبويبات التقارير** | 50 سطراً في `src/pages/AccountingReports.tsx` تبني ملف CSV فعلياً لكل تبويب (ميزان مراجعة، أستاذ مساعد، مقبوضات/مدفوعات، إيرادات/مصروفات، كشف حساب)؛ على `main` المعالج مجرد رسالة نجاح: `onShowToast('success', 'تم تصدير … بنجاح.')` بلا أي ملف |
| 5 | **طباعة شاشة قيود 2024 بترويسة** | 9 أسطر في `src/pages/Journal2024Viewer.tsx` (زرّ طباعة + `PrintHeader`). المكوّن `PrintHeader` **موجود على `main`** ويُستخدم في `AccountingReports`/`BalanceSheet`/`JournalEntries`، فالناقص هو ربطه بهذه الشاشة فقط |
| 6 | **بطاقة الفيديو التعريفي الحقيقية في بوابة الدفع** | 13 سطراً في `src/pages/Gateways.tsx` (`<video controls src="/assets/promo/video/union-promo-wide.mp4">` + رابط تنزيل)؛ على `main` لا تزال الشاشة تعرض `<PromoShowcase />`. ملفات الفيديو موجودة فعلاً في `assets/promo/video/` (يلزم التحقق من مسار التقديم وقت الاستعادة) |
| 7 | **إضافات مكتبة النماذج** | 295 سطراً في `src/pages/ModelsViewer.tsx`: إنشاء مستند نصي جديد (`handleCreateTextDoc`) والإملاء الصوتي داخل الشاشة. (عارض/محرر النص و«فتح بالبرنامج الافتراضي» موجودة على `main` مسبقاً) |
| 8 | **متفرقات** | `.gitignore`: تجاهل `dev-server.log` و`dev_server.log` (سطران — تجميلي)؛ وكيانات Skills وما يتبعها في `src/types/erp.ts` |

> الملفات الأربعة الكبرى المشتركة (`SkillsHub.tsx`، `AiAgentOverview.tsx`، `PortalWelcome.tsx`، `docs/AI_AGENT_OVERVIEW.md`) **متطابقة حرفياً** بين PR #24 وPR #26 (`git diff 046486a:<file> 9e81760:<file>` = فارغ)، فيمكن استعادتها من أي من المرجعين.

**النتيجة:** تعليل الإغلاق «لا يوجد أي عمل ضائع» **غير صحيح**. لم يُفقد PR #26 كاملاً (معظم ملفاته الـ 74 وصلت فعلاً عبر PRs #23/#27/#28/#30/#31)، لكن فُقد **نظام المهارات الموحد** وتبويب النظرة العامة وترحيب البوابة وتصدير CSV الحقيقي وثلاث إضافات أخرى.

---

## 7) ما استُعيد في هذه الجلسة

### 7.1 التغيير الإنتاجي: سقف استجابة Jules

`server/services/jules.service.ts`:

```ts
/**
 * Hard cap for a single upstream response body, in bytes. Jules returns complete activity
 * logs (plans, patches, test output) in one response, so the ceiling has to fit the largest
 * legitimate history: 16 MiB. Anything beyond it is treated as an invalid response and the
 * stream is cancelled immediately, so a hostile or broken upstream cannot exhaust memory.
 */
export const JULES_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
```

- رُفع السقف من `4 MiB` إلى `16 MiB` (قيمة PR #26 التي أُعلنت في وصفه).
- الثابت أصبح **مُصدَّراً** ليكون مصدر الحقيقة الوحيد في الاختبارات (لا أرقام سحرية مكرَّرة).
- ضمانات الأمان لم تتغير: أي تجاوز ⇒ `invalidResponse()` مع **إلغاء فوري للبث** (`reader.cancel()`)، فلا يُقرأ جسم أكبر من السقف في الذاكرة، ويظل الخطأ `JULES_INVALID_RESPONSE` (502) موسوماً `outcomeUnknown` إن كان الطلب كتابياً.

### 7.2 الاختبار الحدي الجديد

في `test/jules.test.ts` — `a response exactly at the 16 MiB cap is accepted and one byte past it cancels the stream`:

1. **تثبيت العقد:** `assert.equal(JULES_MAX_RESPONSE_BYTES, 16 * 1024 * 1024)` — أي تخفيض صامت للسقف يُسقط الاختبار فوراً.
2. **عند الحد تماماً:** جسم صالح بحجم `16 MiB` بالبايت بالضبط (حشو محسوب) يُقرأ حتى النهاية ويُقبل، مع التأكد أن `cancel` **لم تُستدعَ**.
3. **بايت واحد فوق الحد:** الحد + بايت واحد ⇒ رفض بـ `JULES_INVALID_RESPONSE` مع `cancel` واحدة على البث.
4. **بث لا نهائي:** مصدر يُنتج 1 MiB بلا توقف يُلغى بعد تجاوز السقف فقط، مع تحقق أن عدد القراءات مقيّد (`≤ 16 + 2` قطعة) — يثبت أن الجسم لا يُستنزف بعد الإلغاء.

كما حُدِّث الاختبار القديم `invalid or oversized success responses…` ليعتمد على `JULES_MAX_RESPONSE_BYTES + 1` بدل الرقم المضمّن `4 * 1024 * 1024 + 1` — الذي كان سيصبح **تحت السقف الجديد** ويظل «ناجحاً» لسبب خاطئ (فشل تحليل JSON بدل تجاوز الحجم).

### 7.3 التحقق

```
$ npm run test:jules
# tests 39
# pass 39
# fail 0

$ npm run typecheck:server   # نظيف (بلا مخرجات)
$ npm run typecheck:jules    # نظيف (بلا مخرجات)
```

---

## 8) المخزون المتبقي: عمل مفقود لم يُستعد

لم تُدمج هذه الملفات في هذه الجلسة عن قصد: بعضها يعتمد على حِزم غير مثبّتة على `main` (playwright، k6، pgvector، compression)، وبعضها يستلزم دمجاً يدوياً في `server.ts` (2978 سطراً)، فإدخالها دفعة واحدة يخلط بين «استعادة» و«ميزة جديدة» ويعرّض `main` لمخاطر بلا تغطية اختبارية. الأوامر جاهزة للتنفيذ:

```bash
# مراجع غير قابلة للتغيير
git fetch origin refs/pull/24/head:refs/remotes/origin/pr-24
git fetch origin refs/pull/26/head:refs/remotes/origin/pr-26

# مسارات مفيدة
git show origin/pr-24:server/db/migrations/001_financial_numeric_fix.sql
git show origin/pr-26:src/pages/SkillsHub.tsx | head -20

# مثال استعادة مباشرة
git checkout origin/pr-26 -- src/pages/SkillsHub.tsx src/pages/AiAgentOverview.tsx \
  src/components/PortalWelcome.tsx docs/AI_AGENT_OVERVIEW.md
```

### خطة استعادة مقترحة على ثلاث مراحل

| المرحلة | النطاق | القيمة | المتطلبات / المخاطر |
|---|---|---|---|
| **P1 — بلا تبعيات جديدة** | نظام المهارات الموحد (17 مساراً + `api.ts` + `types/erp.ts` + بيانات `store.ts` + `SkillsHub.tsx` + `portals.ts` + `App.tsx`)، تبويب `AiAgentOverview` + المستند، `PortalWelcome.tsx`، زرّ طباعة `Journal2024Viewer`، تصدير CSV الحقيقي في `AccountingReports.tsx` | استعادة ثلاث شاشات كاملة + ميزة تصدير فعلية يستخدمها المستخدم يومياً | تحتاج دمجاً يدوياً في `src/App.tsx` و`src/pages/AiHub.tsx` و`server.ts` (تغيّرت كثيراً) + اختبار واجهة على نمط `*-ui.test.tsx` |
| **P2 — حِزم وتهيئة ونظافة أمنية** | `compression` + تقليل `express.json` إلى 50mb (بند أمني)، `server/middleware/logger.ts` (pino موجود كتبعية)، `/api/system/metrics` و`health-detailed` و`openapi.json`، `monitoring/*`، `scripts/load-test.k6.js`، `scripts/compress-assets.ts`، `playwright.config.ts` + `e2e/*` | رصد وتشغيل إنتاجي وقياس أداء + إغلاق ثغرة `250mb` | إضافة حِزم وسكربتات `package.json` (كما في PR #24)؛ E2E يحتاج تثبيت متصفحات في CI |
| **P3 — قاعدة بيانات ومراجعة أمنية** | هجرات `001…004` (numeric، فهارس، RLS + views، pgvector)، `embedding.service.ts` + RAG، بوابة AI و`/api/ai/stream`، توسيع مترادفات `smart-agent` (25 مجموعة) | دقة مالية على مستوى القاعدة + استرجاع دلالي حقيقي | **تعارض جزئي:** `main` يملك `server/db/pg-schema.sql` بأعمدة `numeric(18,2)` ودُمجت PRs #33/#38 لنفس الهدف — يجب مقارنة الهجرات بالوضع الحالي؛ RLS/PgVector يحتاجان مراجعة صلاحيات وتهيئة امتدادات مستقلة |
| **منفصل** | `docs/AUDIT_REPORT_2026.md` (تقرير لحظي، قيمة أرشيفية)، الصور/الشعارات المضغوطة (9 ملفات) | توثيق ونظافة مستودع | قرار بشأن تضخّم المستودع |

### حالة التنفيذ

| المرحلة | الحالة | ما نُفِّذ فعلاً (تحقق قابل لإعادة التشغيل) |
|---|---|---|
| **P1** | ✅ نُفِّذت | 17 مساراً في `server/routes/skills.routes.ts` + مجموعات المتجر وبذورها (15 مهارة/3 برامج/4 مهارات وكلاء/3 إجراءات/2 ارتباط/2 تسجيل) + 17 دالة في `src/services/api.ts`، الأنواع في `src/types/erp.ts`، `SkillsHub.tsx`، شاشة `skills` في البوابات الثلاث، تبويب `overview` في `AiHub` مع `AiAgentOverview.tsx` و`docs/AI_AGENT_OVERVIEW.md` (أُعيد كتابتهما بلا أرقام وهمية)، `PortalWelcome.tsx` (النطق عبر `speakArabic` المشتركة لا `speechSynthesis` مباشرةً)، زرّ طباعة `Journal2024Viewer`، وتصدير CSV حقيقي في `AccountingReports.tsx` عبر `src/utils/report-csv.ts`. **قرار بطاقة الفيديو:** يُبقى `PromoShowcase` (فحص HEAD + إعادة محاولة + حالة «مفقود») ويُضاف إليه رابط تحميل MP4 الذي كان في PR #26 — بدل حذف الملف واستبداله ببطاقة مضمّنة مكرّرة كما فعل الـ PR. الاختبارات الجديدة (27): `skills`، `report-csv`، `portal-welcome`، `ai-agent-overview`، `promo-video` — مربوطة في `npm test`، ودليل نقاط المهارات أُضيف إلى `docs/API.md`. |
| **P2** | ✅ نُفِّذت | `compression({ threshold: 1024 })` فوق كل المسارات، و`server/middleware/logger.ts` (pino + تحذير الطلبات البطيئة) يزيد عدادات `server/services/metrics.service.ts`، و`server/routes/system.routes.ts`: `/api/system/metrics` (نص Prometheus أو JSON)، `/api/system/health-detailed`، `/api/system/openapi.json` (+`docs/OPENAPI.md`). **البند الأمني:** `express.json` من 250mb إلى 50mb (+`urlencoded` 50mb) — مُتحقَّق حياً: حمولة 52MB تُردّ 413. المراقبة: `monitoring/prometheus.yml` + تزويد Grafana، والاختبارات: `playwright.config.ts` + `e2e/union-erp.spec.ts` (مسارات main فقط، بلا مسارات P3)، `scripts/load-test.k6.js`، و`scripts/compress-assets.ts` (لا يحذف الأصل). اختبارات `test/production-hardening.test.ts` (8) تحرس: الحدّ الأمني، ضغطاً فعلياً على خادم حقيقي، زيادة العدادات، وصحة الوثيقة والسكربتات مقابل مسارات الخادم. لا تشغيل E2E داخل `npm test` (يحتاج متصفحات). |
| **P3** | ⏳ لم تبدأ | — |

لم يُنقل من الـ PRs أي واجهة تعرض أرقاماً غير مقيسة: شاشة `AiAgentOverview` تقرأ `/api/health`
و`/api/skills/summary` وتعرض «—» لأي قيمة غير متاحة (اختبار `test/ai-no-fabrication.test.ts` يمرّ).

---

## 9) الدروس والوقاية

1. **لا تُقارن PR قديم بـ `main` مباشرة.** القياس الصحيح من `merge-base`؛ `git diff --name-only main <branch>` يمكن أن يعطي «صفر اختلاف» أو «112 ملفاً» وكلاهما مضلّل إذا لم تُحدَّد نقطة التفرّع.
2. **لا تعتمد على الفروع، اعتمد على `refs/pull/<n>/head`.** فرعا `integration/full-latest` و`arena/01a0735f-union-erp` الأصليان حُذفا أو أُعيد كتابتهما، وما لولا مراجع الـ PRs لضاع PR #24 نهائياً.
3. **تعليل إغلاق مكتوب ≠ تحقق منفّذ.** إغلاق #19 و#20 حمل سبباً دقيقاً مطابقاً للواقع، أما #24 فأُغلق بلا تفسير و#26 بتعليل «صفر ملفات» مُفنَّد.
4. **الأسطر المضافة والرموز الدلالية وحدة قياس عملية:** «100% من أسطر PR موجودة على `main`» حكم قابل للاختبار، بخلاف «تمّت المعالجة».
5. **عند تغيير حدّ أو ثابت أمني، غيّر معه اختبار الحدّ.** الرقم المضمّن القديم (`4 MiB + 1`) كان سيبقى ناجحاً بعد رفع السقف لسبب غير المقصود.
6. **مسار إغلاق آمن:** قبل إغلاق أي PR دون دمج، سجّل تعليقاً يحمل نتيجته القابلة للتحقق ومرجعه (`refs/pull/<n>/head`) ورقم الـ PR البديل — هذا ما فعله #19/#20 ولم يفعله #24/#26.

---

## 10) ملحق: أوامر التحقق (قابلة لإعادة التنفيذ)

```bash
# 0) التاريخ الكامل ورؤوس الـ PRs
git fetch --unshallow origin
for n in 19 20 24 26; do git fetch origin refs/pull/$n/head:refs/remotes/origin/pr-$n; done

# 1) هل كوميتات الـ PR على main؟
git merge-base --is-ancestor 046486a HEAD && echo "PR24 on main" || echo "PR24 NOT on main"
git merge-base --is-ancestor 9e81760 HEAD && echo "PR26 on main" || echo "PR26 NOT on main"

# 2) الفرق الحقيقي (من نقطة التفرّع، لا من main)
git diff --stat $(git merge-base HEAD origin/pr-24) origin/pr-24
git diff --name-only $(git merge-base HEAD origin/pr-26) origin/pr-26 | wc -l   # 76 مساراً (74 معدّلاً + 2 محذوفين)

# 3) الملفات الغائبة فعلاً عن main
git diff --name-status $(git merge-base HEAD origin/pr-24) origin/pr-24 \
  | awk '$1=="A"{print $2}' | while read -r f; do
      git cat-file -e HEAD:"$f" 2>/dev/null || echo "ABSENT: $f"; done

# 4) إثبات الفقدان المحدَّد
git diff HEAD origin/pr-26 -- server/services/jules.service.ts          # السقف 4→16 MiB
git show origin/pr-26:server.ts | grep -cE "app\.(get|post|put|delete)\('/api/(skills|employee-skills|training-programs|training-enrollments|ai-agent-skills|accounting-procedures)"   # 17
# مقابل 0 على main
grep -c "new Blob" src/pages/AccountingReports.tsx                       # 0 على main مقابل 1 في PR #26

# 5) التحقق النهائي بعد الاستعادة
npm run test:jules      # 39 ناجحاً، 0 فاشل
npm run typecheck:server
npm run typecheck:jules
```

**المراجع:** `refs/pull/24/head` = `046486a` • `refs/pull/26/head` = `9e81760` • `refs/pull/20/head` = `2a7040f` • `refs/pull/19/head` = `2911b20` • `main` = `11c4abc`.
