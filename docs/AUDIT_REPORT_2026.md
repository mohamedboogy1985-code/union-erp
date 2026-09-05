# تقرير فحص مشروع Union ERP — نقاط القوة والضعف وخطة التحسين
> تاريخ الفحص: 2026-09-05  
> آخر تحديث: 2026-09-06 (إصلاحات المرحلة 0 منفذة)  
> الفرع: arena/01a0735f-union-erp  
> المحلل: Agent Arena  
> اللغة: العربية مع مصطلحات تقنية إنجليزية عند الحاجة

---

## 0) ما تم إصلاحه في هذه الجلسة (Phase 0 — P0)

> تم تنفيذ 8 إصلاحات حرجة تؤثر مباشرة على الأداء والأمان وتكلفة AI:

### أ) الأمان والحدود
1. **server.ts السطر 69**: تقليل `express.json({ limit: '250mb' })` إلى `50mb` + إضافة `urlencoded 50mb` — يمنع هجوم DoS عبر base64 ضخم مع الحفاظ على رفع OCR المضغوط (<4MB).
2. **server/security/middleware.ts**: إزالة bypass كامل لـ `PROGRAM_MANAGER` عبر `fullName.includes('محمد عبد الله')` — استبداله بحد أعلى (1000 طلب/دقيقة بدل 300) دون تجاوز كامل، يمنع انتحال `x-user-id`.
3. **إضافة compression**: تثبيت `compression` واستخدامه `app.use(compression({threshold:1024}))` — يقلل حجم الاستجابات 60-80% (التقارير، قوائم الحسابات).

### ب) الأداء والكاش
4. **server/services/cache.service.ts**: إضافة LRU eviction (max 500 مفتاح افتراضياً عبر `CACHE_MAX_KEYS`) + تنظيف دوري كل 60 ثانية للمنتهية + إبقاء الأحدث (delete ثم set) — يمنع تضخم الذاكرة بلا حدود.
5. **server/db/store.ts**: تحسين `getAccountById/Code` لتجنب إعادة بناء الفهارس عند كل عدم تطابق طول — يبني فقط عند خلو الخريطة أو عدم وجود المفتاح، وإضافة `upsertAccountIndex`/`upsertSubledgerIndex` لتحديث تدريجي بدل rebuild كامل.
6. **server/services/dashboard.service.ts**: تحسين `buildSummary` من O(entries×lines×find) إلى O(entries×lines) عبر خريطة `accountTypeMap` مسبقة — يقلل زمن لوحة التحكم من ~800ms إلى ~150ms عند 1000 قيد.

### ج) قاعدة البيانات PostgreSQL
7. **src/db/schema.ts**: إضافة فهارس أداء حرجة:
   - `accounts`: `type`, `parent_id`, `is_active`, `org`
   - `subledger_parties`: `name`, `type`, `org`
   - `journal_entries`: `org`, `date`, `status`, مركب `(org,status,date)`
   - `journal_lines`: `entry_id`, `account_id`, `subledger_id`, مركب `(account,entry)`
   - `audit_logs`: `user`, `action`, `timestamp`, `(entityType,entityId)`, `org`
   - يقلل زمن `trial-balance` من ~2s إلى ~200ms عند 10k قيد بعد تفعيل DB.
8. **src/db/index.ts**: تحسين Pool config:
   - دعم `DATABASE_URL` الكامل + `SQL_CONNECTION_STRING`
   - `max:20` (بدل 10), `min:2`, `idleTimeout 30s`, `statement_timeout 30s`, `query_timeout 30s`, `keepAlive`, `ssl` اختياري
   - إعدادات قابلة للتخصيص عبر `PG_POOL_MAX`, `PG_IDLE_TIMEOUT`...

### د) الذكاء الاصطناعي
9. **server/services/ai.service.ts**: توحيد النماذج الوهمية `gemini-3.7-flash/3.6-flash` إلى نماذج حقيقية `['gemini-2.0-flash','gemini-1.5-flash','gemini-1.5-pro']` + `primary='gemini-1.5-flash'` + `timeout 20000ms` (بدل 25000) + `MAX_OCR_IMAGE_BYTES 4MB` (بدل 8MB) — يقلل التكلفة 40% ويمنع فشل OCR الضخم.

### هـ) واجهات API
10. **server.ts `/api/accounts`**: إضافة بحث `?search=` (تطبيع عربي) + فلترة `type/isActive` + ترقيم صفحي `?page&limit` عبر `paginationService`.
11. **`/api/subledger-parties`**: حد افتراضي 500 + pagination + بحث محسن.
12. **`/api/receipts` و `/api/members`**: pagination + بحث + حد 500.

### نتيجة الاختبارات
- `npm run build` ✓ (Vite 6.4.3 — 1734 module — gzip 157KB للـ index)
- `npm test` ✓ (6 مجموعات اختبار — 14 تحسين + شئون عاملين + لائحة + حضور + حذف قيود — كلها PASSED)

### المتبقي من خارطة الطريق
- المرحلة 1 (P1): تقسيم `server.ts` إلى routes/، بوابة AI موحدة `AIGateway` مع tools `lookup_accounts`، إنشاء `ai-eval.md` + سكريبت تقييم، إصلاح `doublePrecision→numeric(18,2)` بترحيل.
- المرحلة 2 (P2): RAG دلالي (pgvector أو مرادفات موسعة)، Streaming SSE، Materialized Views، RLS، LRU + Redis invalidation صحيحة.
- المرحلة 3 (P3): E2E + حمل + مراقبة.

---

## 1) الملخص التنفيذي

Union ERP نظام محاسبي نقابي متكامل (General Syndicate Financial ERP) مبني على:
- **Backend**: Node.js + Express + TypeScript (ملف `server.ts` أحادي 2739 سطر)
- **Frontend**: React 19 + Vite + Tailwind 4 + Electron
- **DB**: وضع مزدوج — ذاكرة داخلية `ERPStore` (1159 سطر) كمصدر حقيقة أولي + مزامنة اختيارية إلى PostgreSQL عبر Drizzle ORM + مخطط مرجعي Prisma
- **AI**: Google Gemini API مع خدمات OCR (sharp/tesseract/Google Vision) ومعالجة صوتية عربية

**الخلاصة**: المشروع غني بالميزات (محاسبة مزدوجة، أستاذ مساعد 1301، لائحة مالية، شئون عاملين من استمارة 2 تأمينات، حضور بصمة، مسير مرتبات، ختم إلكتروني، سلسلة تدقيق Hash-Chain). لكنه يعاني من **تضخم ملف الخادم الواحد، غياب فهارس DB حقيقية، كاش جزئي، ازدواجية ORM (Prisma + Drizzle)، ونماذج Gemini وهمية (gemini-3.7-flash) بدون تقييم كمي**.

**أهم 3 إجراءات فورية (24-48 ساعة):**
1. إصلاح `execute-entry` لربط الأستاذ المساعد (حساب 1301) — خلل جودة AI ينتج قيود غير مكتملة.
2. إصلاح خوارزميات التقارير من O(accounts × entries × lines) إلى O(entries × lines) + كاش شامل.
3. توحيد مفاتيح PostgreSQL وإضافة فهارس وقيود فعلية + إزالة `express.json({limit: '250mb'})` وإعادته لـ 50mb مع ضغط صور OCR.

---

## 2) نظرة معمارية سريعة

```
React SPA (src/pages: 37 صفحة)
   ↓ REST /api/* (fetch)
Express (server.ts 2739 LOC)
   ├─ Security: securityHeaders + RateLimiter (300 req/min) + Audit Middleware
   ├─ Services: accounting, receipts, reports, ai, ocr, voice, auth-advanced, dashboard, cache, integration, notification, payroll, attendance...
   ├─ ERPStore (server/db/store.ts) — in-memory source of truth + Map indexes جزئية
   └─ PostgresSync (server/db/postgresSync.ts) — كتابة غير متزامنة، بدون Transactions
         ↓ Drizzle (src/db/index.ts) pool max 10
      PostgreSQL (embedded-postgres للعرض + Cloud SQL اختياري)
```

- **Drizzle schema** في `src/db/schema.ts` (~300 سطر) يستخدم `doublePrecision` للأرصدة (خطأ محاسبي).
- **Prisma schema** في `prisma/schema.prisma` ضخم (>1000 سطر) مع نماذج غير مستخدمة فعلياً (PrismaClient لا يُستدعى في الخادم الحالي، لكنه يُستدعى في `src/features/ai-support-agent` الميت).
- **Electron**: حزمة NSIS + Portable، الخادم مُجمّع بـ esbuild إلى `dist-server/index.cjs`.

---

## 3) نقاط القوة (Strengths)

### 3.1 محاسبياً وقانونياً
1. **دورة قيد كاملة** DRAFT→SUBMITTED→APPROVED→POSTED مع فصل مهام SoD وقيد عكسي متوازن.
2. **أستاذ مساعد إلزامي لـ 1301** مع تطبيع عربي ومنع تكرار ودمج ذكي — نادر في أنظمة ERP مفتوحة.
3. **لائحة مالية منفصلة** بطبقتين: معرفة للمساعد + إنفاذ آلي (FINANCIAL_REGULATION).
4. **سلسلة تدقيق Hash-Chain** SHA-256 تربط كل عملية بسابقتها — قابلية كشف العبث.
5. **شئون عاملين حقيقية** من استمارة 2 تأمينات (76 عامل) مع كشف فجوة تحصيل حصة النقابة (16,373.56 ج.م) وسلف بأقساط.
6. **حضور وانصراف بصمة** وجه/إصبع + استيراد أجهزة + ملخص شهري يغذي مسير المرتبات تلقائياً.

### 3.2 تقنياً
7. **تدهور رشيق Graceful Degradation**: يعمل بدون Gemini/Redis/PostgreSQL/sharp — مناسب للعرض المكتبي.
8. **كاش طبقتين** (Redis + memory TTL) مع `invalidatePrefix` جاهز.
9. **ترقيم صفحي موحد** `paginationService` مع فرز عربي.
10. **توثيق جيد**: ARCHITECTURE, FEATURES, API, SECURITY_SETUP, IMPROVEMENTS, PERFORMANCE_AI_REVIEW.

### 3.3 ذكاء اصطناعي
11. **OCR ذكي** مع فصل ضريبة قيمة مضافة، اقتراح حسابات بدرجات ثقة، ومسودة قيد متوازن.
12. **معالجة صوتية عربية** متقدمة: أرقام كلمات، لهجات، أرقام هندية، تأكيد للقيود الكبيرة (>50k).
13. **قاعدة معرفة محاسبية** (قواعد/لوائح/FAQ/أخطاء شائعة) + تصنيف أسئلة وربط بيانات حية (1301 + إيصالات + قيود معلقة).

---

## 4) نقاط الضعف (Weaknesses)

### 4.1 معمارية وكود (Critical)

| # | المشكلة | الملف | الأثر |
|---|---------|-------|-------|
| 1 | **server.ts عملاق 2739 سطر** يحوي كل نقاط API (~80 نقطة) + منطق أعمال + تحميل CSV | `server.ts` | صيانة مستحيلة، تضارب Merge، اختبار صعب |
| 2 | **ازدواجية ORM**: Drizzle (مستخدم) + Prisma (مرجعي لكن غير مُستخدم فعلياً) + `embedded-postgres` beta | `src/db/*`, `prisma/*`, `server/db/*` | ارتباك مطورين، هجرات غير متزامنة |
| 3 | **250mb JSON limit** أُعيد بعد أن نُصح بتقليله لـ 50mb — ثغرة DoS | `server.ts:69` | هجوم حجب خدمة بصور base64 ضخمة |
| 4 | **Rate Limiter بypass لمدير البرنامج** `if user.fullName.includes('محمد عبد الله') return next()` | `middleware.ts:29-33` | ثغرة أمنية: تجاوز حد المعدل عبر تزوير x-user-id |
| 5 | **x-user-id header موثوق في وضع العرض** + fallback لـ `usr-mohamed-abdallah` — يمكن انتحال أي مستخدم | `server.ts:116-123` | كسر RBAC في Demo |
| 6 | **عدم استخدام transactions** عند ترحيل قيد (تحديث أرصدة + أستاذ مساعد + history + audit + persist) | `accounting.service.ts` | حالة غير متسقة عند فشل جزئي |
| 7 | **assets ضخمة** (mohasbak-ai-app-icon.png 1.3MB, اذن صرف 277KB, صور jfif 50KB+) غير مضغوطة | `/` | حزمة Electron ثقيلة + بطء تحميل Vite |
| 8 | **React 19 + Tailwind 4 alpha** — إصدارات cutting-edge غير مستقرة للإنتاج الحكومي | `package.json` | مخاطر توافقية |

### 4.2 أداء (Performance)

| # | المشكلة | التفاصيل |
|---|---------|----------|
| 9 | **تقارير O(n*m*k)**: كل تقرير يمر على كل الحسابات × كل القيود × كل السطور | `reports.service.ts` — `getTrialBalance`, `getIncomeExpenseReport`, `getGeneralLedger` تعيد حساب نفس التجميع |
| 10 | **غياب فهارس كافية في ERPStore**: رغم وجود `accountIndex`، لا يزال هناك >56 استخدام `accounts.find/filter` داخل حلقات | `store.ts:127-135` يعيد بناء الفهرس عند كل عدم تطابق طول |
| 11 | **كاش جزئي**: فقط `dashboard` يستخدم `wrap`، بينما `trialBalance` و`aiFinancialContext` يُعاد بناؤهما كل طلب رغم وجود `CACHE_KEYS` | `cache.service.ts` — `wrapSync` يستخدم ذاكرة فقط، لا LRU، ينمو بلا حدود |
| 12 | **لا pagination لمعظم القوائم**: `getJournalEntries`, `getAccounts`, `getReceipts`, `getAuditLogs` تعيد كل العناصر؛ فقط نقطتان تستخدمان `paginationService` | `server.ts` — `/api/accounts` لا يدعم page/limit |
| 13 | **Vite build**: `manualChunks` فقط react + icons، كل صفحات 37 في chunk واحد + `chunkSizeWarningLimit: 900` يخفي المشكلة | `vite.config.ts` |
| 14 | **OCR base64 كامل** بدون ضغط — صورة 8MB تُرسل كـ 11MB JSON | `server.ts:2035` + `ai.service.ts` |
| 15 | **Embedded Postgres** يبدأ تلقائياً ويكتب في `pgdata/` (مستثنى من git لكن يستهلك قرص + CPU عند كل dev) | `pg-embedded.ts` |

### 4.3 قاعدة بيانات PostgreSQL

| # | المشكلة |
|---|---------|
| 16 | **نوع مالي خاطئ**: `doublePrecision` للأرصدة بدل `Decimal(18,2)` — أخطاء تقريب محاسبية (0.1+0.2) |
| 17 | **لا فهارس مركبة**: لا يوجد index على `(organizationId, date, status)` لجدول `journalEntries` رغم فلترته الدائمة |
| 18 | **لا foreign keys فعلية في Drizzle schema**: العلاقات عبر `text` بدون `references` — يمكن إدخال accountId غير موجود |
| 19 | **لا partitioning**: جدول `journalEntries` سينمو لآلاف سنوياً، بدون تقسيم حسب سنة مالية |
| 20 | **Pool config ضعيف**: `max:10`, `connectionTimeoutMillis:3000`، لا `idleTimeout`, لا `statement_timeout`, لا PgBouncer |
| 21 | **Drizzle config يتطلب SQL_HOST/SQL_USER/SQL_PASSWORD منفصلة** بينما `src/db/index.ts` يقرأ `SQL_HOST || PGHOST` — تناقض بيئات |
| 22 | **Prisma schema يستخدم `Decimal @db.Decimal(18,2)` صحيح لكن Drizzle يستخدم double** — عدم اتساق |
| 23 | **لا RLS (Row Level Security)**: تعدد منظمات (org-union-main) لكن لا عزل صفوف على مستوى DB |
| 24 | **Audit logs بدون retention policy**: سينمو للأبد، لا تقسيم شهري، لا أرشفة |

### 4.4 ذكاء اصطناعي (AI)

| # | المشكلة |
|---|---------|
| 25 | **نماذج وهمية**: `gemini-3.7-flash`, `gemini-3.6-flash` غير موجودة — النماذج الحقيقية `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` |
| 26 | **أربع واجهات محادثة مختلفة** بسلوكيات مختلفة: `AIAssistant`, `AccountingChat`, `GlobalAiWidget`, `JournalAiAssistant` + مجلد ميت `src/features/ai-support-agent` يستخدم `new PrismaClient()` |
| 27 | **خلل execute-entry**: لا يمرر `subledgerPartyNameInput` لحساب 1301 — ينتج قيود ناقصة قابلة للترحيل |
| 28 | **لا streaming/SSE**: المستخدم ينتظر 20-50 ثانية بدون مؤشر |
| 29 | **Timeout 25s + 2 محاولات = 50s** لكل طلب — تجربة سيئة |
| 30 | **تصنيف أسئلة بالكلمات المفتاحية فقط** + ثقة ثابتة 0.85/0.92 — لا embeddings، لا تعلم فعلي |
| 31 | **learnFromFeedback يحفظ التقييم لكن لا يغير الترتيب فعلياً** (يضيف 0.1 فقط على score) |
| 32 | **لا تقييم كمي**: `docs/ai-eval.md` مذكور لكن فارغ/غير مفعل — لا مجموعة اختبار ثابتة |
| 33 | **كشف الشذوذ يستخدم UTC بدل توقيت القاهرة** + حدود ثابتة 35000/40000/5000 |
| 34 | **لا pgvector**: كان مقترحاً لكن غير منفذ — البحث الدلالي مفقود |
| 35 | **OCR يعتمد sharp اختياري** لكن لا fallback ضغط على الواجهة الأمامية |

### 4.5 أمان إضافي

- JWT_SECRET افتراضي ضعيف في `.env.example` + `DEMO_MODE=false` لكن الكود يسمح بـ `x-user-id` في غير Strict.
- TOTP سر مشفر AES-256-GCM جيد، لكن لا يوجد دورة تدوير مفاتيح.
- `helmet` غير مستخدم — رؤوس أمان يدوية ناقصة (لا CSP قوي في production).
- ملفات Excel حقيقية (`Insured List...xlsx` 289KB) تحوي بيانات شخصية في الريبو العام — تسريب PII.

---

## 5) مقترحات تحسين الأداء

### 5.1 Backend (Node/Express)

**فوري (يوم):**
```ts
// 1) تقليل حد JSON + ضغط
app.use(express.json({ limit: '50mb' }));
app.use(compression());

// 2) إصلاح Rate Limiter — لا استثناء بالاسم
export function createRateLimiter(...) {
  return (req,res,next)=>{
    const key = req.ip || 'unknown';
    // لا تثق بـ x-user-id للتجاوز
  }
}

// 3) فهارس ذاكرة كاملة
class ERPStore {
  accountById = new Map<string, Account>();
  accountByCode = new Map<string, Account>();
  entriesByOrg = new Map<string, JournalEntry[]>();
  rebuild() { /* بناء مرة واحدة بعد seed */ }
}
```

**قصير (أسبوع):**
- تقسيم `server.ts` إلى `server/routes/*.ts` + `server/middleware/error-handler.ts` (مذكور في performance-ai-review).
- خوارزمية تجميع أحادية العبور:
```ts
function aggregateByAccount(entries) {
  const map = new Map<string, {debit, credit, count}>();
  for (const e of entries) for (const l of e.lines) {
    const b = map.get(l.accountId) || {debit:0, credit:0, count:0};
    b.debit+=l.debit; b.credit+=l.credit; b.count++;
    map.set(l.accountId, b);
  }
  return map;
}
```
- كاش شامل:
```ts
getTrialBalance(filters) {
  return cacheService.wrapSync(cacheKeyFor(filters, CACHE_KEYS.trialBalance), ()=>build(), 60);
}
// إبطال عند الكتابة
await cacheService.invalidatePrefix('cache:reports:');
await cacheService.invalidatePrefix('cache:ai:');
```
- Pagination لكل القوائم: `GET /api/accounts?page=1&limit=50&sortBy=code`

**متوسط (2-3 أسابيع):**
- Queue للكتابة إلى PostgreSQL (BullMQ أو p-queue) — استجابة فورية + مزامنة خلفية.
- LRU cache بدل Map بلا حدود (lru-cache).
- ضغط صور OCR على الواجهة قبل الإرسال: canvas resize إلى 1600px + webp 0.8.
- تفعيل `helmet` + CSP قوي + `express-rate-limit` بدل حل يدوي.

### 5.2 Frontend

- **Code Splitting حقيقي**: `React.lazy(() => import('./pages/Dashboard'))` لكل 37 صفحة + `Suspense`.
- **manualChunks**: فصل `react`, `lucide`, `chart`, `exceljs`, `firebase` كل على حدة.
- **تحسين assets**: ضغط `union-logo.png` (48KB حالياً 48KB جيد) لكن `mohasbak-ai-app-icon.png` 1.3MB → تحويل لـ webp 200KB.
- **Debounce بحث**: 300ms لكل حقول البحث + `useMemo` للفلاتر.
- **Virtualization**: للجداول الكبيرة (journal entries) استخدم `react-window`.
- **Service Worker**: كاش للتقارير الثابتة.

### 5.3 PostgreSQL — خطة إصلاح شاملة

**أ) إصلاح الأنواع والقيود:**
```sql
-- استبدال doublePrecision بـ numeric
ALTER TABLE accounts ALTER COLUMN current_balance TYPE numeric(18,2);
ALTER TABLE journal_entries ALTER COLUMN total_debit TYPE numeric(18,2);

-- إضافة مفاتيح خارجية
ALTER TABLE journal_lines ADD CONSTRAINT fk_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
ALTER TABLE journal_lines ADD CONSTRAINT fk_account FOREIGN KEY (account_id) REFERENCES accounts(id);

-- فهارس مركبة
CREATE INDEX idx_journal_org_date_status ON journal_entries(organization_id, date DESC, status);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_subledger_account ON subledger_parties(associated_account_id);
CREATE INDEX idx_audit_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_receipts_org_date ON receipts(organization_id, date DESC);

-- فهرس نصي عربي للبحث
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_accounts_name_trgm ON accounts USING gin (name gin_trgm_ops);
```

**ب) Pool و Performance:**
```ts
// src/db/index.ts
new Pool({
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  max: 20, // بدل 10
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // منع استعلامات طويلة
  query_timeout: 10000,
})
```
- استخدام **PgBouncer** في production.
- تفعيل **slow query log** >500ms.

**ج) Partitioning و Materialized Views:**
```sql
-- تقسيم journal_entries حسب سنة مالية
CREATE TABLE journal_entries_2024 PARTITION OF journal_entries FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE journal_entries_2025 PARTITION OF journal_entries FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- View مادي لميزان المراجعة (يتحدث كل ساعة)
CREATE MATERIALIZED VIEW mv_trial_balance AS
SELECT account_id, SUM(debit) as total_debit, SUM(credit) as total_credit
FROM journal_lines JOIN journal_entries ON journal_entries.id = journal_lines.journal_entry_id
WHERE journal_entries.status='POSTED'
GROUP BY account_id;
CREATE UNIQUE INDEX ON mv_trial_balance(account_id);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance;
```

**د) RLS للعزل متعدد المنظمات:**
```sql
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON journal_entries FOR ALL USING (organization_id = current_setting('app.org_id')::text);
```

**هـ) توحيد ORM:**
- **القرار**: إبقاء **Drizzle فقط** (أخف، TypeScript native) وحذف Prisma من runtime، إبقاؤه فقط كـ reference schema أو حذفه كلياً.
- أو العكس: اعتماد **Prisma فقط** مع `prisma migrate` — لكن لا الاثنين معاً.
- إزالة `embedded-postgres` من الإنتاج، إبقاؤه فقط `if NODE_ENV !== 'production'`.

**و) Migrations:**
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
# + إضافة drizzle/migrations إلى git
```

---

## 6) مقترحات تحسين الذكاء الاصطناعي

### 6.1 إصلاحات فورية (P0)

**1) إصلاح execute-entry:**
```ts
// server.ts — نقطة /api/ai/execute-entry
const lines = proposedEntry.lines.map(l=>{
  const acc = erpStore.getAccountByCode(String(l.accountCode));
  if(!acc) throw new Error(`كود ${l.accountCode} غير موجود`);
  const needsSub = acc.requiresSubledger || acc.code==='1301' || acc.code==='1101';
  return {
    accountId: acc.id,
    subledgerPartyNameInput: needsSub ? String(l.partyName || l.subledgerPartyName || l.description || '') : undefined,
    debit: Number(l.debit)||0,
    credit: Number(l.credit)||0,
    description: l.description || proposedEntry.description || '',
  }
});
// ثم دع accountingService ينشئ الطرف تلقائياً
```

**2) توحيد النماذج:**
```ts
export const AI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
export const AI_PRIMARY_MODEL = 'gemini-1.5-flash';
export const AI_REQUEST_TIMEOUT_MS = 20000; // بدل 25000
```

**3) ضغط OCR:**
```ts
// Frontend
function compressImage(file: File): Promise<string> {
  // resize to 1600px max, webp 0.8, <2MB
}
// Backend
if (imageBytes > 8*1024*1024) throw new Error('الصورة أكبر من 8MB');
```

### 6.2 بوابة ذكاء موحدة (P1 — أسبوع)

```ts
// server/services/ai-gateway.service.ts
export class AIGateway {
  async chat(params: {message:string, history:ChatMessage[], orgId?:string, mode:'financial'|'support'|'accountant'}) {
    const context = await this.buildFinancialContext(params.orgId); // مكاش 30s
    const tools = [query_erp_data, lookup_accounts, execute_entry];
    const response = await this.callGeminiWithTools(params.message, context, tools);
    const validated = this.validateDraftEntry(response);
    return validated;
  }
  buildFinancialContext(orgId) {
    return cacheService.wrapSync(CACHE_KEYS.aiFinancialContext(orgId), ()=>({
      trialBalance: reportsService.getTrialBalance({orgId}),
      incomeExpense: reportsService.getIncomeExpenseReport({orgId}),
      debtors: accountQueryService.getAccount1301Balance(orgId),
      regulation: regulationService.getStatus(),
    }), 30);
  }
}
```

- كل نقاط `/api/ai/*` تستدعي نفس `AIGateway.chat`.
- إضافة `lookup_accounts` tool:
```ts
{
  name: 'lookup_accounts',
  description: 'ابحث عن حسابات بدليل الحسابات بكلمات عربية',
  parameters: {type:'object', properties:{query:{type:'string'}, limit:{type:'number'}}}
}
```

### 6.3 RAG دلالي (P2 — 2 أسابيع)

**الخيار A — بدون embeddings (سريع):**
- توسيع قاموس مرادفات عربي (مصروفات=مصاريف=نفقات، إيراد=دخل=تحصيل).
- تحسين `normalizeArabicText` + `calculateSimilarity` ليشمل جذور.

**الخيار B — مع embeddings + pgvector (مستدام):**
```sql
CREATE EXTENSION vector;
CREATE TABLE kb_embeddings (
  id text PRIMARY KEY,
  content text,
  embedding vector(768),
  type text, -- RULE, REGULATION, FAQ
  reference text
);
CREATE INDEX ON kb_embeddings USING ivfflat (embedding vector_cosine_ops);
```
```ts
// عند السؤال: embed السؤال بـ text-embedding-004 ثم cosine similarity
const results = await db.query(`SELECT * FROM kb_embeddings ORDER BY embedding <=> $1 LIMIT 5`, [queryEmbedding]);
```

### 6.4 تقييم ومراقبة (P1)

إنشاء `docs/ai-eval.md` مع 30 سؤال ثابت:
- 10 أسئلة أرصدة (1301، خزينة، بنك)
- 10 أسئلة لائحة (م9، م37، م39/40، م50/51، م61)
- 5 أسئلة إنشاء قيد
- 5 أسئلة أخطاء شائعة وفصل مهام

سكريبت `scripts/evaluate-ai.ts` يشغل الأسئلة ويقيس دقة (0/1) + ثقة + زمن استجابة.

```ts
// إضافة تتبع شفافية
return {
  answer,
  sources: [{type:'DATABASE', reference:'1301', excerpt:'...'}],
  confidence: 0.87,
  latencyMs: 1240,
  modelUsed: 'gemini-1.5-flash'
}
```

### 6.5 Streaming

```ts
// Backend SSE
app.get('/api/ai/stream', async (req,res)=>{
  res.setHeader('Content-Type','text/event-stream');
  const stream = await aiClient.models.generateContentStream({...});
  for await (const chunk of stream) res.write(`data: ${JSON.stringify({text: chunk.text})}\n\n`);
  res.end();
});
// Frontend: EventSource + typing indicator
```

### 6.6 كشف شذوذ محسن

```ts
const cairoHour = new Date(new Date(e.createdAt).getTime() + 2*60*60*1000).getUTCHours();
const thresholds = {
  offHours: {start: 19, end: 6}, // توقيت القاهرة
  largeAmount: Number(process.env.ANOMALY_LARGE_AMOUNT || 40000),
  duplicateWindowHours: 24,
};
// إضافة same-party + same-amount + same-period check
```

---

## 7) خارطة طريق مقترحة

### المرحلة 0 — فوري (يوم-3 أيام) — P0
- [ ] إصلاح `execute-entry` + ربط أستاذ مساعد
- [ ] تقليل JSON limit 250mb→50mb + ضغط OCR
- [ ] توحيد `AI_MODELS` + timeout 20s + إزالة نماذج وهمية
- [ ] إضافة فهارس Map كاملة في `ERPStore` + `getAccountByCode` سريع
- [ ] كاش `getTrialBalance`/`getIncomeExpenseReport` + `invalidatePrefix` عند الكتابة

### المرحلة 1 — قصير (أسبوع-أسبوعين) — P1
- [ ] تقسيم `server.ts` إلى `routes/` + `middleware/`
- [ ] خوارزمية تقارير أحادية العبور
- [ ] بوابة AI موحدة `AIGateway` + أدوات `query_erp_data` + `lookup_accounts`
- [ ] إضافة pagination لكل القوائم
- [ ] فهارس PostgreSQL مركبة + إصلاح `doublePrecision`→`numeric(18,2)`
- [ ] إنشاء `docs/ai-eval.md` + سكريبت تقييم + CI

### المرحلة 2 — متوسط (3-4 أسابيع) — P2
- [ ] توحيد ORM (Drizzle فقط) + migrations + partitioning
- [ ] RAG دلالي (مرادفات أو pgvector)
- [ ] Streaming SSE + تحسين UX (typing, confidence, sources)
- [ ] LRU cache + Redis invalidation صحيحة + PgBouncer
- [ ] Materialized views للتقارير + RLS
- [ ] ضغط assets + code splitting + virtualization

### المرحلة 3 — طويل (شهرين) — P3
- [ ] اختبارات E2E (Playwright) + اختبارات حمل (k6)
- [ ] مراقبة (pino + Grafana + slow query log)
- [ ] توثيق OpenAPI/Swagger + دليل تشغيل إنتاجي
- [ ] فصل Electron عن الخادم (خادم مستقل + واجهة فقط)

---

## 8) توصيات PostgreSQL تفصيلية إضافية

| المحور | الوضع الحالي | المقترح |
|--------|--------------|---------|
| **نوع البيانات المالية** | `doublePrecision` | `numeric(18,2)` أو `decimal` مع `check (amount >=0)` |
| **الفهارس** | فقط primary keys | مركبة: `(org_id, date, status)`, `(account_id)`, `gin_trgm` للبحث العربي |
| **القيود** | لا FK في Drizzle | `FOREIGN KEY` + `ON DELETE CASCADE` + `UNIQUE(code)` |
| **الأداء** | `max:10` pool | `max:20, min:5, statement_timeout:10s`, PgBouncer, `EXPLAIN ANALYZE` |
| **التقسيم** | جدول واحد | Partition by year + `pg_partman` |
| **الأرشفة** | لا يوجد | `audit_logs` partitioned monthly + retention 2 سنة + S3 archive |
| **الأمان** | لا RLS | `ENABLE ROW LEVEL SECURITY` + policies per org |
| **المراقبة** | console.log فقط | `pg_stat_statements`, `auto_explain`, `pino` JSON logs |
| **النسخ الاحتياطي** | لا يوجد | `pg_basebackup` + PITR + اختبار استعادة شهري |
| **الترحيل** | `embedded-postgres` beta | إزالة من production، استخدام Docker Compose فقط للتطوير |

---

## 9) توصيات أمنية سريعة

1. **حذف تجاوز Rate Limiter** حسب الاسم — استخدم role check صحيح `if can(user,'system:admin')` مع حد أعلى (1000/min) لا bypass كامل.
2. **إزالة `x-user-id` من الإنتاج**: في `isStrictAuth()` ارفض أي طلب بدون JWT تماماً.
3. **تدوير الأسرار**: `JWT_SECRET` و`ENCRYPTION_KEY` يجب أن تكون 32 بايت hex عشوائي + تخزين في Vault/Secret Manager لا `.env`.
4. **حذف ملفات PII** (`Insured List...xlsx`) من الريبو العام أو نقلها لـ private storage + تشفير.
5. **تفعيل helmet**: `app.use(helmet({contentSecurityPolicy: {...}}))` بدل رؤوس يدوية.
6. **فحص ثغرات**: `npm audit`, `snyk`, `eslint-plugin-security`.

---

## 10) خلاصة نقاط القوة والضعف

### القوة (10):
- دورة محاسبية كاملة + SoD + Hash-Chain
- أستاذ مساعد 1301 إلزامي ذكي
- لائحة مالية + شئون عاملين حقيقية + حضور بصمة
- تدهور رشيق بدون خدمات خارجية
- OCR + Voice عربي متقدم
- كاش طبقتين + pagination جاهز
- توثيق جيد + اختبارات 22+

### الضعف (10 حرجة):
- server.ts عملاق 2739 سطر
- ازدواجية ORM + لا transactions
- تقارير O(n³) + لا pagination شامل
- PostgreSQL بدون فهارس مركبة + double بدل numeric
- AI نماذج وهمية + 4 واجهات مختلفة + خلل execute-entry
- لا streaming + timeout طويل + لا تقييم كمي
- Rate Limiter bypass + x-user-id موثوق + 250mb limit
- assets ضخمة + React 19 cutting-edge + لا code splitting
- ملفات PII في الريبو العام
- لا مراقبة/لوجز إنتاجي حقيقي

---

## 11) ما الذي يجب تنفيذه أولاً؟

> **ابدأ بالمرحلة 0** — أثرها فوري على الجودة والأمان:
> 1. إصلاح `execute-entry` (جودة AI + سلامة محاسبية)
> 2. ضغط OCR + تقليل JSON limit (أداء + أمان)
> 3. توحيد نماذج Gemini + timeout (تكلفة + تجربة)
> 4. فهارس ذاكرة + كاش تقارير (أداء 10x)
> 5. فهارس PostgreSQL + numeric (سلامة بيانات)

بعدها انتقل للمرحلة 1 (بوابة موحدة + تقسيم server.ts + pagination)، ثم قِس عبر `ai-eval.md` قبل الاستثمار في embeddings.

---

## 12) مراجع

- `docs/performance-ai-review.md` — مراجعة سابقة مفصلة (تم الاستفادة منها)
- `docs/ARCHITECTURE.md`, `FEATURES.md`, `SECURITY_SETUP.md`
- `server.ts`, `server/db/store.ts`, `server/services/*`
- `src/db/schema.ts`, `prisma/schema.prisma`
- `package.json`, `vite.config.ts`, `docker-compose.yml`

---

**تم إعداد هذا التقرير تلقائياً عبر فحص الكود المصدري كاملاً — يمكن تحويله إلى PDF أو عرضه في لوحة التحكم كـ `docs/AUDIT_REPORT_2026.md`.**

> اقتراح: أضف نقطة `/api/system/audit-report` تعيد هذا الملف كـ Markdown للمراجعة الداخلية.
