# دليل التشغيل الإنتاجي — Union ERP — P2/P3

## 1) المتطلبات

- Node.js >=18, npm >=9
- PostgreSQL 15+ مع `pgvector` و `pg_trgm`
- Redis 7 (اختياري لكن موصى به للكاش متعدد النسخ)
- PgBouncer 1.22+ (للإنتاج متعدد النسخ)
- (اختياري) Prometheus + Grafana للمراقبة

## 2) إعداد البيئة

```bash
cp .env.example .env
# عدّل:
# DATABASE_URL=postgres://union:union@localhost:5432/union_erp
# أو SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DB_NAME
# REDIS_URL=redis://localhost:6379
# GEMINI_API_KEY=...
# JWT_SECRET=... (32 بايت hex عشوائي)
# ENCRYPTION_KEY=... (32 بايت)
# DEMO_MODE=false
# ALLOW_SQL_CONSOLE=false
# PG_POOL_MAX=20
# CACHE_MAX_KEYS=1000
# MV_AUTO_REFRESH=true
# MV_REFRESH_INTERVAL_MS=900000 (15 دقيقة)
```

## 3) تشغيل عبر Docker Compose (موصى به)

```bash
docker-compose up -d postgres redis pgbouncer
# شغل الترحيلات
npm run migrate # أو npx drizzle-kit migrate
# بذر RAG
curl -X POST http://localhost:3000/api/system/rag/seed -H "x-user-id: usr-mohamed-abdallah"
# شغل الخادم
npm run build
NODE_ENV=production npm start
```

مع مراقبة:

```bash
docker-compose --profile monitoring up -d
# Grafana: http://localhost:3001 (admin / union_admin)
# Prometheus: http://localhost:9090
```

## 4) الترحيلات اليدوية للإنتاج

```bash
psql $DATABASE_URL -f server/db/migrations/001_financial_numeric_fix.sql
psql $DATABASE_URL -f server/db/migrations/002_performance_indexes.sql
psql $DATABASE_URL -f server/db/migrations/003_rls_and_materialized_views.sql
psql $DATABASE_URL -f server/db/migrations/004_pgvector_embeddings.sql
psql $DATABASE_URL -c "ANALYZE;"
```

## 5) PgBouncer

- وضع `transaction` يقلل اتصالات PG من 20/نسخة إلى 5 فعلية
- في `DATABASE_URL` للإنتاج استخدم منفذ 6432 بدل 5432
- مثال: `DATABASE_URL=postgres://union:union@pgbouncer:5432/union_erp`

## 6) Redis

- عند ضبط `REDIS_URL` يتحول الكاش تلقائياً من memory إلى Redis + memory fallback
- سياسة `allkeys-lru` مع `maxmemory 256mb` تمنع تضخم الذاكرة
- إبطال انتقائي: `cacheService.invalidatePrefix('cache:reports:')`

## 7) المراقبة

- `GET /api/system/health-detailed` — صحة + إحصاءات PG + كاش
- `GET /api/system/metrics` — Prometheus format
- `GET /api/system/mv/status` — حالة Materialized Views
- سجل بطء: `log_min_duration_statement=500` في postgres (أكثر من 500ms يُسجل)
- pino JSON logs: كل الطلبات >500ms تُسجل كـ WARN

## 8) الأمان الإنتاجي

- `DEMO_MODE=false` — يرفض أي طلب بدون JWT
- `ALLOW_SQL_CONSOLE=false` — يقفل `/api/database/execute-migration`
- `helmet` عبر `securityHeadersMiddleware` + CSP قوي في production
- Rate limiter: 300/min للعامة، 1000/min لـ SYSTEM_ADMIN/PROGRAM_MANAGER
- تدوير أسرار: `JWT_SECRET` و `ENCRYPTION_KEY` عبر Vault/Secret Manager

## 9) ضغط الأصول

```bash
npm run assets:compress
# يولد webp بجانب كل PNG كبير (97% توفير)
# الملفات: assets/icon.webp (40KB بدل 1.6MB)
```

## 10) اختبارات

```bash
npm test                # وحدة
npm run eval:ai         # تقييم AI كمي 30 سؤال
npm run test:e2e        # Playwright E2E (يحتاج npx playwright install)
k6 run scripts/load-test.k6.js  # حمل
```

## 11) فصل Electron

- الخادم: `dist-server/index.cjs` (esbuild)
- الواجهة: `dist/` (Vite)
- للإنتاج: شغل الخادم مستقلاً، وElectron فقط كـ wrapper يفتح `http://localhost:3000`
- `electron/main.cjs` يقرأ `UNION_DIST_DIR` و `PORT` من البيئة

## 12) النسخ الاحتياطي

```bash
pg_basebackup -D /backup -Ft -z -P
# أو
pg_dump $DATABASE_URL | gzip > backup-$(date +%F).sql.gz
# اختبر الاستعادة شهرياً
```
