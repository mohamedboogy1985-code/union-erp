# مسار المشروع وتأكيد سلامة الأجزاء — Union ERP

> **التوثيق (2026-09-06)** — توثيق مسار الكود وتأكيد أن جميع مكونات المشروع وحِزَم الاختبار تعمل بنجاح.

## 1) المسار النشط للمشروع

```
المسار الفعلي:     C:\Users\HP\union-erp
فرع git:           arena/01a0735f-union-erp
بيئة التشغيل:      Windows 10 / PowerShell 5.1 (win32)
Node.js:           v24.18.0
npm:               12.0.2
```

> ⚠️ **تحذير الدليل القديم**: يوجد مجلد `C:\Users\HP\Downloads\union-erp-main\union-erp-main`
> (فرع `main`) بنسخة قديمة مستقلة. أي خادم يُشغَّل منه يحجز المنفذ 3000 ويعرض نسخة
> دون التعديلات. عند التشغيل تأكد أن الخادم يقوم من `C:\Users\HP\union-erp` فقط.

## 2) بنية الأجزاء (Components)

| الجزء | العدد | المسار |
|-------|-------|--------|
| صفحات React | 42 | `src/pages/*.tsx` (بما يشمل 5 محاور Hubs مدمجة حديثاً) |
| مكوّنات واجهة | 18 | `src/components/*.tsx` (بما يشمل `PortalLogo` الجديد) |
| باقي src (hooks, utils, config, db, services, middleware) | — | `src/**` |
| Routers خادم | 11 | `server/routes/*.ts` / `.js` |
| Services + Middleware + Security | 35 | `server/services`, `server/middleware`, `server/security` |
| نماذج Prisma + PostgreSQL | — | `prisma/`, `server/db/` |
| اختبارات tsx | 6 | `test/*.test.ts` |
| اختبار E2E (Playwright) | 1 | `e2e/union-erp.spec.ts` |
| توثيق | 20 | `docs/*.md` |

### الوحدات المدمجة حديثاً (بوابة النقابة)
- `RegulationBudgetsHub` — اللائحة المالية + الموازنة التقديرية
- `AuditSettingsHub` — سجل التدقيق + الإعدادات
- `InsuredActuarialHub` — المؤمَّن عليهم + الدراسات الإكتوارية
- `AccountingHub` (+ تبويب قيود يومية 2024) و `MembershipHub` (+ تبويب اللجان)
- `PortalLogo` + `/assets/logos/{union,training,mohasbak-ai}-logo.png`
- `utils/speech.ts` — الترحيب الناطق عبر Web Speech API

## 3) تأكيد عمل كل الأجزاء (Operational Status — 2026-09-06)

| الفحص | النتيجة |
|-------|---------|
| `npm test` (6 مجموعات) | ✅ **كلها PASSED** (0 فشل) |
| `npm run build:frontend` (vite) | ✅ نجح (~11.7s) |
| `npm run build:server` (esbuild) | ✅ نجح → `dist-server/index.cjs` (7.1MB) |
| `npm run lint` (eslint) | ✅ **0 أخطاء** (499 تحذير قديمة من نوع any/unused) |
| `npx tsc --noEmit` | ⚠️ خطآن قديمان في ملفات غير معدلة (`src/db/index.ts:49`, `src/middleware/security.ts:2` — لا علاقة لهما بالتعديلات) |
| خادم التطوير (المنفذ 3000) | ✅ يعمل من `C:\Users\HP\union-erp` — `GET /api/health` → 200 |
| الشعارات عبر `assets/` | ✅ `/assets/logos/*.png` كلها 200 |
| `release/win-unpacked/Union Financial ERP.exe` | ✅ مبني وجاهز (يناير 2026 الزمني لا يُعد مؤشراً بلاغياً) |

> إصلاح إضافي أثناء الفحص: نقل `src/hooks/useVirtualization.ts` → `.tsx`
> (كان يحتوي JSX بامتداد `.ts` فأفشل parser الإعراب). لم يعد هناك أي خطأ ESLint.

## 4) حِزَم الاختبار — النتيجة التفصيلية

| المجموعة | النتيجة | أبرز بنود التأكيد |
|----------|---------|-------------------|
| `accounting.test.ts` | ✅ 8/8 | قيود متوازنة، 1301 تلقائي، SoD، فترات مغلقة، توزيع الإيرادات SHA-256 |
| `improvements.test.ts` | ✅ 14/14 | صوت وهندية، OCR، وكيل ذكي، AES-256، TOTP، قفل دخول، كاش، ترقيم |
| `employee-affairs.test.ts` | ✅ 7/7 | 76 عاملاً من CSV استمارة 2، سلف، فجوة اشتراك نقابي، تدقيق مُتواصَل (hash chain) |
| `regulation.test.ts` | ✅ 8/8 | 17 مادة لائحة مفعّلة، BLOCK/WARN، سقف سلف، نسب التوزيع |
| `attendance.test.ts` | ✅ 7/7 | بصمة IN/OUT، إجازات مدفوعة، ربط بأتمتة المرتبات، قيد متوازن |
| `journal-delete.test.ts` | ✅ 2/2 | حذف مسودة، CRUD قيود 2024 |

**المجموع: 6/6 مجموعات — 46/46 تأكيداً، صفر فشل.**

## 5) توزيع البوابات (Portals)

- `syndicate` (بوابة النقابة) — 20+ شاشة عبر محاور مدمجة — content أكبر
- `training` (مركز التدريب) — شئون عاملين/مرتبات/حضور/سلف + شاشات 2024
- `committees` (اللجان) — اللجان النقابية + بيانات اللجان — بورتفوليو مستقل
- شاشات مشتركة ALL: الذكاء الاصطناعي (`aihub`)، `skills`، الإعدادات

انظر `docs/PORTAL_SEPARATION.md` و `docs/AI_AGENT_OVERVIEW.md` للتفاصيل.

## 6) أوامر التشغيل المرجعية

```bash
npm run dev                    # خادم + Vite middleware (HMR) على :3000
npm test                       # مجموعة الاختبارات الكاملة (6 ملفات tsx)
npm run build:frontend         # dist/ (vite)
npm run build:server           # dist-server/index.cjs (esbuild)
npm run electron:dir           # بناء نسخة ويندوز folder (win-unpacked)
npm run electron:build         # NSIS installer + Portable
```