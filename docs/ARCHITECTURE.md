# الهيكلة المعمارية — Union ERP

> هذا الملف جزء من تنفيذ خطة `docs/IMPROVEMENTS.md` (البند 10: التوثيق الشامل).

## نظرة عامة

Union ERP نظام مالي محاسبي للنقابات، مبني على معمارية **ثلاثية الطبقات** مع خادم Node/Express واحد يخدم واجهة React (عبر Vite في وضع التطوير) وواجهة برمجية REST.

```
┌─────────────────────────────────────────────────────────────┐
│                     React SPA (src/)                        │
│   Pages: Dashboard, JournalEntries, AIAssistant, Receipts…  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/* (fetch, JSON)
┌──────────────────────────▼──────────────────────────────────┐
│              Express Server (server.ts)                      │
│  ┌──────────────── طبقة الأمان (IMPROVEMENTS 5) ──────────┐ │
│  │ SecurityHeaders → ComprehensiveAudit → RateLimiter     │ │
│  │ JWT/Bearer + x-user-id (Demo) + 2FA(TOTP) + Lockout    │ │
│  └────────────────────────────────────────────────────────┘ │
│  Services (server/services)                                  │
│  ├─ accounting.service   القيود والأستاذ المساعد 1301        │
│  ├─ receipts.service     الإيصالات وتوزيع الإيرادات          │
│  ├─ reports.service      التقارير وميزان المراجعة            │
│  ├─ ai.service           Gemini (استعلام/OCR/صوت/تنبؤ)       │
│  ├─ account-query.service  ربط البيانات الحية (IMPROV 2.2)  │
│  ├─ smart-agent.service    تصنيف + قاعدة معرفة + تعلم (2.1) │
│  ├─ ocr.service          OCR محسن + اقتراح حسابات (3.x)     │
│  ├─ voice.processor      تحليل النية العربية (4.x)           │
│  ├─ auth-advanced.service  دخول/قفل/2FA (5.1)               │
│  ├─ dashboard.service    لوحة ذكية + إنذارات (6.1)           │
│  ├─ cache.service        Redis/ذاكرة مع TTL (7.1)            │
│  ├─ integration.service  استيراد/تصدير خارجي (8.1)           │
│  └─ notification.service إشعارات متعددة القنوات (8.2)        │
│                                                              │
│  ERPStore (server/db/store.ts) — مصدر الحقيقة في الذاكرة     │
│    + PostgresStorageManager (Cloud SQL اختياري)              │
│    + Audit Hash-Chain + AccountingHistory + Templates        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Drizzle ORM (اختياري)
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │ (Cloud SQL) │
                    └─────────────┘
```

## طبقات النظام

| الطبقة | المجلد | المسؤولية |
|--------|--------|-----------|
| العرض | `src/pages`, `src/components` | واجهات React/RTL |
| النقل | `server.ts` | توجيه REST، وسائط الأمان، جلسات |
| الخدمات | `server/services` | منطق الأعمال المحاسبي والذكي |
| البيانات | `server/db` | ERPStore + مزامنة Postgres |
| الأدوات | `server/utils` | عربية، تشفير، TOTP، ترقيم صفحي |
| الأمان | `server/security` | رؤوس، حد معدل، تدقيق شامل |
| المعرفة | `server/data` | قاعدة معرفة محاسبية |

## قرارات معمارية رئيسية

1. **ERPStore في الذاكرة أولاً**: يعمل النظام كاملاً دون قاعدة بيانات (وضع العرض)، مع مزامنة اختيارية إلى PostgreSQL عبر Drizzle عند توفر بيانات الاتصال.
2. **سلسلة تدقيق مشفرة**: كل عملية تُربط بالعملية السابقة عبر SHA-256 (Hash Chain) فلا يمكن العبث بسجل التدقيق دون كشفه.
3. **فصل المهام (SoD)**: منشئ القيد ≠ المعتمد ≠ المرحّل، وتُفرض القاعدة في `accounting.service`.
4. **تدهور رشيق (Graceful Degradation)**: كل الخدمات الذكية تعمل دون Gemini/sharp/Redis ببدائل محلية (fallbacks).
5. **توافق الواجهة**: أي نقطة API جديدة تحافظ على شكل الاستجابة القديم (مثل `?page` الاختياري للترقيم).

## دورة حياة القيد المحاسبي

```
DRAFT ──submit──► SUBMITTED ──approve (SoD)──► APPROVED ──post──► POSTED
  ▲                                                │                  │
  └────────────── reverse (قيد عكسي متوازن) ◄───────┴──────────────────┘
```

عند الترحيل (`post`): تحديث أرصدة الحسابات + الأستاذ المساعد 1301 + **تسجيل سجل التحديثات المحاسبية AccountingHistory**.

## الاختبارات

- `test/accounting.test.ts` — المحرك المحاسبي الأساسي (8 اختبارات).
- `test/improvements.test.ts` — ميزات خطة التحسين (14 اختباراً).

```bash
npm test        # يشغّل الملفين عبر tsx
```
