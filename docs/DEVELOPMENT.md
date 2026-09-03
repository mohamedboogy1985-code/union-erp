# دليل التطوير — Union ERP

## المتطلبات

- Node.js ≥ 18 (مستحسن 20+)
- npm ≥ 9
- (اختياري) PostgreSQL للتخزين السحابي، Redis للكاش المشترك

## التثبيت والتشغيل

```bash
git clone https://github.com/mohamedboogy1985-code/union-app.git
cd union-app
npm install
cp .env.example .env     # ثم عدّل القيم

npm run dev              # الخادم + Vite على http://localhost:3000
```

> يعمل النظام بدون أي خدمة خارجية: بيانات العرض في الذاكرة، والخدمات الذكية
> تتحول تلقائياً لبدائل محلية عند غياب `GEMINI_API_KEY`.

## أوامر NPM

| الأمر | الوصف |
|-------|-------|
| `npm run dev` | تشغيل الخادم مع Vite middleware (HMR) |
| `npm run build` | ترجمة TypeScript |
| `npm test` | **تشغيل حزمة الاختبارات (accounting + improvements) عبر tsx** |
| `npm run lint` | فحص ESLint |
| `npm run format` | تنسيق Prettier |

## متغيرات البيئة المهمة

انظر `.env.example` للقائمة الكاملة. الأبرز:

| المتغير | الوصف |
|---------|-------|
| `GEMINI_API_KEY` | مفتاح Gemini للخدمات الذكية |
| `JWT_SECRET` / `JWT_EXPIRE` | توقيع التوكنات |
| `MAX_FAILED_ATTEMPTS` / `LOCKOUT_MINUTES` | سياسة قفل الدخول (5/15 افتراضياً) |
| `VOICE_CONFIRMATION_THRESHOLD` | حد طلب تأكيد القيود الصوتية (50000) |
| `DEBTOR_ALERT_THRESHOLD` | حد إنذار مديونية 1301 (150000) |
| `REDIS_URL` / `REDIS_TTL` | كاخ Redis الاختياري |
| `RATE_LIMIT_MAX` | حد الطلبات/دقيقة لكل IP (300) |
| `EMAIL_API_URL` / `EMAIL_API_KEY` / `SMS_API_URL` / `SMS_API_KEY` | قنوات التنبيه الخارجية |

## هيكل المساهمات البرمجية

```
server.ts                       # نقاط REST (اقرأ docs/API.md)
server/services/*.service.ts    # منطق أعمال مستقل قابل للاختبار
server/security/middleware.ts   # الأمان والتدقيق
server/data/knowledge-base.ts   # قاعدة معرفة المساعد
server/db/store.ts              # ERPStore + بيانات أولية
src/pages/*.tsx                 # واجهات React
test/*.test.ts                  # اختبارات assert بنمط tsx
```

### قواعد إلزامية قبل الدمج

1. `npm test` أخضر بالكامل.
2. أي خدمة جديدة تعمل **بدون** اعتماديات خارجية (fallback رشيق).
3. أي نقطة API جديدة تُوثق في `docs/API.md`.
4. العمليات المالية الحساسة تمر عبر `erpStore.recordAudit` مع بيان كافٍ.
5. لا تكسر توافق استجابات API القديمة (استخدم باراميترات اختيارية).

## إضافة قالب قيد جديد

```ts
// server/db/store.ts → seedInitialData → journalTemplates
{ id: 'tpl-x', name, nameAr, category, debitAccountCode, creditAccountCode, keywords: [...] , isActive: true, ... }
```

المطابقة تتم عبر `smartAgentEnhancer.matchJournalTemplate()` و`advancedVoiceProcessor`.

## تشغيل Postgres (اختياري)

```bash
docker run -d --name union-pg -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=union_app -p 5432:5432 postgres:16
# ثم اضبط SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DB_NAME في .env
```

مخطط Prisma المرجعي في `prisma/schema.prisma` (يشمل نماذج التحسينات:
AccountingHistory / JournalTemplate / Budget + Fulltext + Soft deletes).
