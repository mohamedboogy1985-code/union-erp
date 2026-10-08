# بناء نسخة سطح المكتب (Electron) — Union ERP

> يمكن تشغيل النظام كتطبيق سطح مكتب كامل (Windows/Mac/Linux) بخادمه المدمج.

## البنية

```
electron/
├── main.cjs      # العملية الرئيسية: تشغيل الخادم + نافذة التطبيق + قائمة عربية
└── preload.cjs   # جسر آمن (contextIsolation + sandbox)
```

- **في التطوير**: تُسجَّل `tsx` وتُشغَّل `server.ts` مباشرة داخل العملية الرئيسية.
- **في الحزمة النهائية**: يُحمَّل الخادم المُجمَّع `dist-server/index.cjs` (حزمة CJS واحدة
  بلا node_modules) بواجهة مبنية من `dist/` — أي أن الملف التنفيذي النهائي مكتفٍ ذاتياً.

## أوامر البناء

| الأمر | الوصف |
|-------|-------|
| `npm run electron:ensure` | تنزيل الملف التنفيذي لـ Electron إلى `node_modules/electron/dist` إن لم يكن موجوداً (يُستدعى تلقائياً من أوامر البناء) |
| `npm run electron:dev` | فتح تطبيق سطح المكتب على خادم التطوير |
| `npm run electron:dir` | حزمة سريعة غير مضغوطة (اختبار محلي) في `release/` |
| `npm run electron:build` | **بناء كامل**: مثبت NSIS + نسخة محمولة لـ Windows x64 |
| `BUILD_ELECTRON_WINDOWS.cmd` | نفس البناء بنقرة مزدوجة على Windows |

### خطوات البناء الكامل (ما يفعله `electron:build`)

0. `install-electron` → التأكد من وجود `node_modules/electron/dist` (Electron 40+ ينزّله عند الطلب لا في postinstall)
1. `vite build` → `dist/` (الواجهة)
2. `esbuild` تجميع `server.ts` → `dist-server/index.cjs` (الخادم بملف واحد)
3. `electron-builder` → `release/UnionERP-<version>-x64.exe` (مثبت) + `release/UnionERP-Portable-<version>-x64.exe`

## التكوين

كل إعدادات الحزم في `electron-builder.yml`:
- `appId`: `org.unionerp.unionapp`
- أهداف Windows: `nsis` (مثبت مع اختيار مسار التثبيت) + `portable` (بدون تثبيت)
- الأيقونة: `assets/icon.png` (تُحوَّل تلقائياً إلى ICO)
- `asar: true` — ضغط مصادر التطبيق في أرشيف واحد

## سلوك التطبيق المُحزَّم

- يبدأ الخادم داخلياً على `127.0.0.1:3000` (قابل للتغيير بمتغير `PORT`).
- ينتظر جاهزية `/api/health` قبل فتح النافذة (حتى 90 ثانية).
- مثيل واحد فقط (Single Instance Lock) — التكرار يُركّز النافذة الموجودة.
- الروابط الخارجية تُفتح في المتصفح الافتراضي ولا تُنقل داخل التطبيق.
- يعمل بلا PostgreSQL وبدلاً مركزياً: البيانات في الذاكرة (وضع العرض) —
  وعند توفر Cloud SQL تتم المزامنة تلقائياً.

## بناء لأنظمة أخرى

```bash
npx electron-builder --linux AppImage   # لينكس
npx electron-builder --mac dmg          # ماك (يتطلب بيئة macOS للتوقيع)
```

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| المنفذ 3000 مستخدم | أغلق العملية القديمة أو شغّل بـ `PORT=3100 electron .` |
| نافذة خطأ "تعذر تشغيل الخادم" | شغّل التطبيق من طرفية وشاهد سجل الخادم |
| `The specified electronDist does not exist: node_modules/electron/dist` | Electron 40+ لا ينزّل الملف التنفيذي أثناء `npm install`؛ شغّل `npm run electron:ensure` (أو `npx install-electron`) — سكربتات `electron:build`/`electron:dir` وسير العمل تفعل ذلك تلقائياً |
| فشل تنزيل ثنائيات Electron | اضبط `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |

## البناء السحابي عبر GitHub Actions (بدون جهاز محلي)

سير العمل `.github/workflows/build-electron.yml` (**Build Electron Desktop App**) يبني مثبت Windows تلقائياً:

| الحدث | النتيجة |
|-------|---------|
| دفع إلى `main` | اختبارات + بناء، والملفات في **Artifacts** باسم `UnionERP-Windows-x64-<version>` (30 يوماً) |
| دفع وسم `v*` (مثل `v1.2.0`) | اختبارات + بناء + **GitHub Release** منشور بالملفات وبصمات SHA-256 |
| **Run workflow** يدوياً | بناء من أي فرع، ومع خيار `publish_draft_release` يُنشأ Release كمسودة للمراجعة |

الملفات الناتجة:
- `UnionERP-<version>-x64.exe` — المثبت (NSIS)
- `UnionERP-Portable-<version>-x64.exe` — النسخة المحمولة بدون تثبيت
- `SHA256SUMS.txt` — بصمات التحقق

قبل التغليف يمرّ البناء بحزمة الاختبارات الكاملة (Linux) ثم اختبار دخان للخادم المجمّع على Windows
(`scripts/smoke-server-bundle.mjs`) — نفس الخادم الذي يعمل داخل الحزمة.

> خطوات إخراج إصدار جديد خطوة بخطوة: [RELEASE.md](./RELEASE.md)

## ملاحظة عن بيئات البناء المقيدة الشبكة

بعض بيئات التطوير السحابية تحجب تنزيل ثنائيات Electron من شبكة تسليم GitHub
(`objects.githubusercontent.com`). في هذه الحالة استخدم أحد الخيارين:
1. **GitHub Actions** (أعلاه) — يبني على خوادم GitHub دون قيود.
2. **جهازك المحلي** عبر `BUILD_ELECTRON_WINDOWS.cmd` حيث الشبكة مفتوحة.
