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
| POST | `/auth/login/2fa` | إكمال الدخول برمز TOTP — `{username, code}` |
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
