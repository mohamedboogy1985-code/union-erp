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
| `npm run electron:dev` | فتح تطبيق سطح المكتب على خادم التطوير |
| `npm run electron:dir` | حزمة سريعة غير مضغوطة (اختبار محلي) في `release/` |
| `npm run electron:build` | **بناء كامل**: مثبت NSIS + نسخة محمولة لـ Windows x64 |
| `BUILD_ELECTRON_WINDOWS.cmd` | نفس البناء بنقرة مزدوجة على Windows |

### خطوات البناء الكامل (ما يفعله `electron:build`)

1. `vite build` → `dist/` (الواجهة)
2. `esbuild` تجميع `server.ts` → `dist-server/index.cjs` (الخادم بملف واحد)
3. `electron-builder` → `release/UnionERP-x64.exe` (مثبت) + `release/UnionERP-Portable-x64.exe`

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
| فشل تنزيل ثنائيات Electron | اضبط `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |

## البناء السحابي عبر GitHub Actions (بدون جهاز محلي)

ملف `.github/workflows/build-electron.yml` يبني تلقائياً مثبت Windows عند كل دفع
للفرع الرئيسي، ويمكن تشغيله يدوياً من تبويب **Actions → Build Electron Desktop App → Run workflow**.

الناتج يظهر في صفحة التشغيل ضمن **Artifacts** باسم `UnionERP-Windows-x64` ويحتوي:
- `UnionERP-1.1.0-x64.exe` — المثبت (NSIS)
- `UnionERP-Portable-1.1.0-x64.exe` — النسخة المحمولة بدون تثبيت

## ملاحظة عن بيئات البناء المقيدة الشبكة

بعض بيئات التطوير السحابية تحجب تنزيل ثنائيات Electron من شبكة تسليم GitHub
(`objects.githubusercontent.com`). في هذه الحالة استخدم أحد الخيارين:
1. **GitHub Actions** (أعلاه) — يبني على خوادم GitHub دون قيود.
2. **جهازك المحلي** عبر `BUILD_ELECTRON_WINDOWS.cmd` حيث الشبكة مفتوحة.

> ⚠️ **ملاحظة لصاحب المستودع**: ملف الـ workflow (`.github/workflows/build-electron.yml`)
> جاهز في مجلد المشروع لكن يتطلب دفعه حسابك الشخصي (توكنات التطبيقات تُمنع من
> تعديل الـ workflows). ادفعه مرة واحدة بأمر واحد من جهازك:
>
> ```bash
> git add .github/workflows/build-electron.yml && git commit -m "ci: electron build" && git push
> ```
>
> بعدها ستجد البناء التلقائي في تبويب **Actions** مع كل دفعة، وعلى فرع `main` بعد الدمج.
