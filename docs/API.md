# دليل واجهة البرمجة (API) — Union ERP

> جميع النقاط تحت بادئة `/api`. المصادقة عبر `Authorization: Bearer <JWT>` (من `POST /api/auth/login`)
> أو ترويسة `x-user-id` في وضع العرض التجريبي.

## الصحة والنظام

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/health` | حالة النظام وإحصاءات سريعة |
| GET | `/system/cache-stats` | إحصاءات الكاش (المشغل + المفاتيح) |

## المصادقة والأمان (IMPROVEMENTS 5)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/auth/login` | دخول بإصدار JWT — body: `{username, password?}` |
| POST | `/auth/login/2fa` | إكمال الدخول برمز TOTP — `{username, code, password}` (كلمة المرور مطلوبة للحسابات المؤمّنة/الوضع الصارم) |
| POST | `/auth/2fa/setup` | تفعيل 2FA وإرجاع `otpauth://` للـ QR |
| POST | `/auth/2fa/disable` | إيقاف التحقق الثنائي |
| GET | `/security/state` | حالة أمان المستخدم (محاولات/قفل/2FA) |
| GET | `/security/access-log?limit=` | آخر طلبات API الموثقة |

**قواعد القفل**: 5 محاولات فاشلة ⇒ قفل 15 دقيقة (قابل للضبط عبر `MAX_FAILED_ATTEMPTS` و`LOCKOUT_MINUTES`).

## دليل الحسابات والسجلات (IMPROVEMENTS 1)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/accounts` | الدليل كاملاً |
| POST | `/accounts` | حساب جديد |
| GET | `/accounts/history?accountId=&limit=` | **سجل التحديثات المحاسبية** (رصيد قبل/بعد/تغيّر) |
| GET | `/accounts/:id/history` | سجل حساب محدد (id أو code) |
| GET | `/journal-templates` | قوالب القيود النشطة |
| POST | `/journal-templates` | إنشاء قالب `{name, nameAr, category, debitAccountCode, creditAccountCode, keywords[]}` |
| POST | `/journal-entries/from-template` | قيد جاهز من قالب `{templateId, amount, date?}` |

## القيود المحاسبية

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/journal-entries?organizationId=&status=&type=` | قائمة (أو **مرقمة** بإضافة `&page=&limit=&sortBy=&sortOrder=`) |
| POST | `/journal-entries` | إنشاء قيد متوازن مع فحوص SoD/1301 |
| POST | `/journal-entries/:id/submit` \| `/approve` \| `/post` \| `/reverse` | دورة الاعتماد والترحيل والعكس |

## المساعد الذكي (IMPROVEMENTS 2)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/ai/query` | المساعد المالي Gemini مع بيانات حية |
| GET | `/ai/account-1301` | **رصيد 1301 فوراً** + أكبر المدينين + آخر 10 حركات |
| GET | `/ai/pending-entries` | القيود بانتظار الاعتماد |
| GET | `/ai/latest-receipts?limit=` | آخر الإيصالات |
| POST | `/ai/support-question` | سؤال دعم ذكي `{question, organizationId?}` ⇒ تصنيف + إجابة + مصادر + بيانات |
| POST | `/ai/feedback` | تقييم إجابة `{ticketId, rating(1-5), comment?}` |
| GET | `/ai/knowledge-base?q=` | قاعدة المعرفة المحاسبية (بحث اختياري) |
| GET | `/ai/anomalies` | كشف الشذوذ والاحتيال |
| GET | `/ai/financial-forecast?horizon=` | التنبؤ المالي |

## الصوت وOCR (IMPROVEMENTS 3/4)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/ai/voice-intention` | `{spokenText}` ⇒ نية + قيد متوازن + `confirmationRequired` |
| POST | `/ai/voice-dictation` | التحليل الصوتي الكامل (مع Gemini عند توفر المفتاح) |
| POST | `/ocr/process` | `{fileName?, rawText?, imageBase64?}` ⇒ بيانات مستخرجة + اقتراحات + مسودة قيد |
| GET | `/ocr/records?limit=` | سجل عمليات OCR (للإنذارات) |

## استيراد البيانات الحقيقية (شاشات الدليل والقيود)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/import/chart-of-accounts-csv` | استبدال الدليل بالدليل الموحد من CSV (`{csvText}`) — زر **"استيراد دليل CSV"** في شاشة دليل الحسابات |
| POST | `/import/journal-entries-csv` | استيراد قيود اليومية من CSV (`{csvText}`) — زر **"استيراد قيود CSV"** في شاشة القيود |

> يتم أيضاً **تحميل تلقائي** لملفَي `server/data/دليل_الحسابات_الموحد_النهائي.csv`
> و`server/data/قيود_اليومية_2024.csv` عند إقلاع الخادم، مع:
> - مطابقة الحسابات بالاسم المطبع (يتوافق مع أي دليل)
> - إنشاء حسابات الأستاذ المساعد تلقائياً (استخلاص اسم الشخص من البيان)
> - ترحيل أرصدة القيود المرحّلة + تسجيل سجل التحديثات المحاسبية
> - فترات مالية تاريخية مقفلة للبيانات المؤرشفة

## لوحة التحكم (IMPROVEMENTS 6)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/dashboard/summary` | ملخص ذكي (أرصدة/إنذارات/رسوم) بكاش 60ث |
| POST | `/dashboard/run-alerts` | فحص إنذارات + إطلاق إشعارات تلقائية |

## التقارير

| Method | Endpoint |
|--------|----------|
| GET | `/reports/general-ledger` \| `/trial-balance` \| `/income-expense` \| `/receipts-payments` |
| GET | `/reports/subledger/:partyId` |

## شئون العاملين (استكمال وحدة شئون العاملين)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/employees?search=` | قائمة العاملين المستزرعين من «استمارة 2 تأمينات» (بحث بالاسم/الكود) |
| GET | `/employee-affairs/summary` | ملخص: الأجور، حصص النقابة، فجوة التحصيل، إحصاءات الشئون والسلف |
| GET | `/employee-affairs?employeeId=&type=&status=` | الشئون الإدارية بمرشّحات (الكل يقرأ) |
| POST | `/employee-affairs` | تسجيل شأن `{employeeId, type, startDate, endDate?, days?, amount?, reason}` — يتطلب `hr:manage` |
| POST | `/employee-affairs/:id/status` | البت `{status: APPROVED\|REJECTED}` — يتطلب `hr:manage` |
| DELETE | `/employee-affairs/:id` | حذف شأن — يتطلب `hr:manage` |
| GET | `/employee-advances?employeeId=` | سلف العاملين (الكل يقرأ) |
| POST | `/employee-advances` | صرف سلفة `{employeeId, amount, installmentAmount, issueDate, reason?}` — يتطلب `hr:manage` |
| POST | `/employee-advances/:id/payments` | سداد قسط `{amount, date, method?, notes?}` (يُقفل السلفة تلقائياً عند السداد الكامل) |
| DELETE | `/employee-advances/:id` | حذف سلفة — يتطلب `hr:manage` |

## سرب أدوات ERP (`/api/swarm`)

سرب أدوات **قراءة فقط** على بيانات المتجر الحقيقية، بصلاحيات RBAC نفسها، وحالة مهمة محفوظة على الخادم.
التفاصيل الكاملة: `docs/SWARM_ERP_TOOLS.md`.

| المسار | الوصف |
| --- | --- |
| `GET /api/swarm/tools` | سجل الأدوات المتاحة للمستخدم الحالي (`readOnly`, `permission`, `available`) — بلا شيفرة تنفيذ |
| `POST /api/swarm/tasks` | إنشاء مهمة `{ request, input? }` ⇒ خطة بخطوات لكل خطوة حالة نجاح متوقعة وبدائل معلنة |
| `GET /api/swarm/tasks` · `GET /api/swarm/tasks/:id` | حالة المهام على الخادم (خطوات، ملاحظات، أدلة، فشل، ثقة، تحقق) |
| `POST /api/swarm/tasks/:id/run` | تنفيذ خطوة واحدة `{ stepId?, input? }` |
| `POST /api/swarm/tasks/:id/run-all` | تنفيذ الخطة كاملة (بحد 6 خطوات) حتى حالة نهائية |

**حالات المهمة:** `PLANNED` · `RUNNING` · `VERIFIED` · `FAILED` · `BLOCKED`.
لا يُعلن `VERIFIED` إلا بخطوة تحقق مستقلة (`ledger.verify-chain`) وأدلة فعلية غير فارغة؛ وكل خطوة ومهمة
تُكتب في سجل التدقيق (`SWARM_TASK_PLANNED` / `SWARM_STEP_EXECUTED` / `SWARM_TASK_COMPLETED`).

## البحث الدلالي RAG (المرحلة P3)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/system/rag/stats` | حالة الفهرس: عدد المستندات، حجم المفردات، توفر القاعدة/الجدول، النموذج — `system:admin` |
| GET | `/system/rag/search?q=&limit=` | بحث في قاعدة المعرفة واللائحة المالية ودليل الحسابات |
| POST | `/system/rag/seed` | بذر الفهرس محلياً وفي `pgvector` إن توفر — `system:admin` |

الاستجابة تحمل `provenance` صريحاً: `modelUsed` (`local-tfidf` أو `pgvector-embedding`)، و`embedded`،
و`confidence` (`HIGH`/`MEDIUM`/`LOW`) و`topScore`. بلا `GEMINI_API_KEY` أو بلا جدول `kb_embeddings`
يعمل البحث محلياً بالكامل ويقول ذلك — ولا يُقدَّم «لا مطابقة واثقة» كأنه نتيجة.

## نظام المهارات الموحد (استُعيد من PR #24/#26)

كل بيانات المهارات في المتجر الموحد `erpStore` (مهارات، ارتباطات الموظفين، برامج تدريبية،
تسجيلات، مهارات وكلاء الذكاء الاصطناعي، إجراءات محاسبية). القراءة متاحة لكل مستخدم موثّق،
والكتابة تحتاج `hr:manage` عدا تفعيل/تعطيل مهارات الوكلاء فيحتاج `system:admin` وتنفيذ
الإجراء المحاسبي فيحتاج `journal:create`. تنفيذ الإجراء **يسجّل خطواته في التدقيق ولا يُرحّل
قيداً بنفسه** — الترحيل يبقى على شاشة القيود.

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/skills?category=&level=&status=&search=&isActive=` | كتالوج المهارات بمرشّحات (فئة/مستوى/حالة/بحث/مفعّلة) |
| GET | `/skills/summary` | ملخّص: الإجماليات، التوزيع بفئة، أكثر المهارات، القريبة من الانتهاء |
| POST | `/skills` | إضافة مهارة `{name, description?, category: HR\|TRAINING\|AI_AGENT\|ACCOUNTING, level?...}` — `hr:manage` |
| PUT | `/skills/:id` | تعديل مهارة — `hr:manage` |
| DELETE | `/skills/:id` | حذف مهارة (يحذف ارتباطاتها بالموظفين منعاً لمراجع يتيمة) — `hr:manage` |
| GET | `/employee-skills?employeeId=&skillId=&category=` | ارتباطات الموظفين بالمهارات |
| POST | `/employee-skills` | ربط موظف بمهارة `{employeeId, skillId, proficiency?}` (النسبة تُقيَّد ٠..١٠٠) — `hr:manage` |
| DELETE | `/employee-skills/:id` | إلغاء ربط — `hr:manage` |
| GET | `/training-programs?category=&status=` | البرامج التدريبية |
| POST | `/training-programs` | إنشاء برنامج `{title, durationHours?, maxParticipants?, skillsGranted?}` — `hr:manage` |
| GET | `/training-enrollments?programId=&employeeId=&status=` | التسجيلات |
| POST | `/training-enrollments` | تسجيل متدرب `{programId, employeeId}` (يُرفض بـ 409 عند اكتمال العدد) — `hr:manage` |
| PUT | `/training-enrollments/:id/progress` | تحديث `{progress, score?, status?}` (بلوغ ١٠٠٪ يُنهي التسجيل) — `hr:manage` |
| GET | `/ai-agent-skills` | مهارات وكلاء الذكاء الاصطناعي وحالتها |
| PUT | `/ai-agent-skills/:id/toggle` | تفعيل/تعطيل مهارة وكيل — `system:admin` |
| GET | `/accounting-procedures` | الإجراءات المحاسبية وحالاتها |
| POST | `/accounting-procedures/:id/execute` | تنفيذ إجراء (جدولة خطوات + تدقيق، بلا ترحيل قيود) — `journal:create` |

تحقق: `npm run test:skills` (كتالوج + صلاحيات + تدفق التدريب + التدقيق) و`npm run test:report-csv`
(تصدير التقارير) و`npm run test:portal-welcome` (الترحيب والتوجيه).

## التكامل والإشعارات (IMPROVEMENTS 8)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/integration/import` | استيراد `{source, entityType: ACCOUNTS\|MEMBERS\|SUBLEDGER_1301\|JOURNAL_ENTRIES, rows[]}` |
| POST | `/integration/export` | تصدير `{reportType, format: JSON\|CSV, organizationId?}` (CSV بترميز UTF-8 BOM للعربية) |
| POST | `/notifications/send-alert` | تنبيه متعدد القنوات `{title, message, severity?, email?, phone?}` |
| GET | `/notifications` \| `/audit-logs` | إشعارات وسجل تدقيق (ترقيم اختياري) |

## أمثلة سريعة

```bash
# رصيد 1301 فوراً
curl http://localhost:3000/api/ai/account-1301

# أمر صوتي
curl -X POST http://localhost:3000/api/ai/voice-intention \
  -H 'Content-Type: application/json' \
  -d '{"spokenText":"تسجيل قيد مصروفات صيانة بقيمة 1500 جنيه بشيك من بنك مصر"}'

# OCR من نص فاتورة
curl -X POST http://localhost:3000/api/ocr/process \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"invoice.pdf","rawText":"فاتورة رقم INV-100 الإجمالي: 51300.00 التاريخ: 2026-02-15 توريد وصيانة"}'

# فجوة تحصيل حصة النقابة من استمارة 2
curl http://localhost:3000/api/employee-affairs/summary

# صرف سلفة عامل وسداد قسط منها
curl -X POST http://localhost:3000/api/employee-advances \
  -H 'Content-Type: application/json' \
  -d '{"employeeId":"emp-001","amount":6000,"installmentAmount":500,"issueDate":"2026-08-01","reason":"ظروف اجتماعية"}'
curl -X POST http://localhost:3000/api/employee-advances/adv-XXX/payments \
  -H 'Content-Type: application/json' \
  -d '{"amount":500,"date":"2026-08-31","method":"PAYROLL_DEDUCTION"}'
```

## أخطاء شائعة

| الرمز | المعنى |
|-------|--------|
| 400 | بيانات ناقصة أو قاعدة عمل مرفوضة (رسالة عربية توضح السبب) |
| 401 | مصادقة فاشلة أو حساب مقفل |
| 404 | الكيان غير موجود |
| 429 | تجاوز حد معدل الطلبات (مع `retryAfterMs`) |


## وكيل البرمجة Jules

واجهة المدير تحت `/api/jules/*` تستخدم JWT حقيقياً (ولا تقبل تبديل مستخدم العرض لأي اتصال فعلي).
تشمل الحالة والمستودع والجلسات والأنشطة وإنشاء المهام واعتماد الخطة وإرسال الملاحظات.
التكامل معطّل افتراضياً؛ راجع [دليل Jules ونقاط API وحدود الأمان](./JULES.md).


## محاسبك — مساعد التشغيل الصوتي المرئي

الوحدة الجديدة تحت `/api/operator-assistant/*`: الحالة، الإملاء/المسودات، التقارير، وإشارات فيديو D-ID.
كل العمليات عدا الحالة العامة تتطلب JWT صادرًا من دخول كلمة مرور فعلي مع صلاحيات الكيان.
لا يوجد endpoint لحفظ سجل ERP أو حذف بيانات أو تنفيذ أوامر من مخرجات النموذج.
المسار القديم غير الموثّق `/api/live-agent` يعيد `410 Gone` عند محاولة WebSocket.
راجع [دليل المساعد ونقاط API](./OPERATOR_ASSISTANT.md).
