# هجرات قاعدة البيانات (P3)

استُعيدت من PR #24 (`refs/pull/24/head` = `046486a`) بعد مقارنتها بما دُمج فعلاً على `main`.
الملفات **قابلة للإعادة** (idempotent) قدر الإمكان، ولا تُشغَّل تلقائياً من أي مسار في التطبيق.

| الملف | الغرض | ملاحظة التعارض/التكامل مع main |
|---|---|---|
| `001_financial_numeric_fix.sql` | تحويل الأعمدة المالية القديمة إلى `numeric(18,2)` | `main` (بعد PRs #33/#38) يعرّفها أصلاً `numeric(18,2)` في `server/db/pg-schema.sql` ⇒ الملف الآن **ترقية للقواعد القديمة فقط**: يتحقق من النوع قبل التغيير ويضيف قيود `CHECK` فقط إن لم تكن موجودة |
| `002_performance_indexes.sql` | فهارس مركبة + `pg_trgm` للبحث العربي | لا يوجد أي منها في `pg-schema.sql` (فيه فقط فهارس فريدة لـ `audit_logs`) ⇒ **إضافة صافية**، كل الفهارس بـ `IF NOT EXISTS` |
| `003_rls_and_materialized_views.sql` | `mv_trial_balance` و`mv_monthly_income_expense` + RLS اختياري | القوائم المادية والإصلاح: **إضافة صافية**؛ RLS لم يبقَ تلقائياً — يحتاج `SET app.enable_rls='on'` صراحةً، لأن السياسة الأصلية كانت تسمح بكل الصفوف عند عدم ضبط `app.org_id` |
| `004_pgvector_embeddings.sql` | جدول `kb_embeddings` (`vector(768)`) + `rag_search_logs` + فهارس HNSW/trgm | يحتاج امتداد `pgvector`؛ بدونه يفشل الملف عمداً بدل إنشاء جدول ناقص — وخدمة RAG تعمل محلياً (TF-IDF) بلا هذا الجدول |
| `005_article72_works_progress_95.sql` | تحديث قاعدة الأعمال في المادة (72) من القيمة التشغيلية السابقة 5% إلى 95% المختارة من المستخدم، مع بقاء 5% الضمان منفصلة | يحدّث فقط صفاً مفعّلاً للمادة 72 ما زال على القيمة الافتراضية القديمة 5؛ لا يغيّر 5% المتبقية أو 75% التشوينات. لا يثبت أصالة ملف الوقائع المرفوع.

## التشغيل

```bash
# نسخة احتياطية أولاً — إلزامية
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql

# بالترتيب
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/001_financial_numeric_fix.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/002_performance_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/003_rls_and_materialized_views.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/004_pgvector_embeddings.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/005_article72_works_progress_95.sql

# فحص ما هو مطبَّق فعلاً (بلا تعديل)
npm run db:migrations:check
```

`npm run db:migrations:check` يشغّل `scripts/apply-migrations.ts --dry-run`: يقرأ الملفات ويرتّبها
ويفحص الفهرس ووجود الجداول/الامتدادات، **ولا ينفّذ أي DDL**. عند غياب PostgreSQL يخرج بالرسالة
`قاعدة البيانات غير متاحة` بلا فشل — لأن التطبيق يعمل كاملاً في وضع الذاكرة.

## ما لم يُتحقَّق منه هنا

هذه الهجرات **لم تُنفَّذ** في بيئة التطوير الآلية (لا يوجد PostgreSQL: تشغيل القاعدة المضمّنة يفشل
بسبب غياب `libpq.so.5`، والخادم يعمل في وضع الذاكرة). لذلك أُبقي كل ملف بسيطاً وقابلاً للإعادة،
ويجب تشغيله على قاعدة حقيقية قبل الاعتماد عليه في الإنتاج.
