# إصدار نسخة جديدة — Union Financial ERP

> دليل مختصر لإخراج إصدار سطح المكتب (Windows x64) عبر GitHub Actions، دون الحاجة إلى جهاز بناء محلي.

## نظرة عامة

| العنصر | القيمة |
|--------|--------|
| مصدر رقم الإصدار | `package.json` → `version` (يظهر في `/api/health` وفي `window.electronAPI.version` داخل Electron) |
| سير العمل | `.github/workflows/build-electron.yml` — **Build Electron Desktop App** |
| بوابة الجودة | حزمة الاختبارات الكاملة على Linux ثم اختبار دخان للخادم المجمّع على Windows |
| المخرجات | `UnionERP-<version>-x64.exe` (مثبت NSIS) + `UnionERP-Portable-<version>-x64.exe` (محمولة) + `SHA256SUMS.txt` |
| مكان النشر | صفحة **Releases** في المستودع، وأيضاً **Artifacts** في صفحة التشغيل (30 يوماً) |

## متى يعمل سير العمل؟

| الحدث | ما يحدث |
|-------|---------|
| دفع إلى `main` | اختبارات + بناء + رفع الملفات كـ Artifacts فقط (لا يُنشأ Release) |
| دفع وسم `vX.Y.Z` | اختبارات + بناء + **إنشاء Release منشور** بالملفات وملاحظات الإصدار |
| دفع وسم `vX.Y.Z-beta.1` (يحتوي `-`) | مثل السابق لكن يُعلَّم **Pre-release** ولا يصبح "Latest" |
| **Run workflow** يدوياً | بناء من أي فرع؛ مع تفعيل `publish_draft_release` يُنشأ Release **مسودة** للمراجعة قبل النشر |
| Pull Request يمس ملفات التغليف | بناء تحقق فقط |

> ⚠️ عند دفع وسم، يفشل البناء مبكراً إن كان الوسم لا يطابق `package.json` (مثلاً وسم `v1.2.0` مع إصدار `1.1.0`).

## خطوات الإصدار (الطريقة المعتمدة)

```bash
# 1) ابدأ من main محدث ونظيف
git checkout main && git pull

# 2) ارفع رقم الإصدار (يُحدّث package.json + package-lock.json، ويُنشئ commit ووسم v1.2.0 تلقائياً)
npm version 1.2.0 -m "chore(release): v%s"
#    بدائل: npm version patch | minor | major
#    نسخة تجريبية: npm version 1.2.0-beta.1 -m "chore(release): v%s"

# 3) ادفع الـ commit والوسم معاً
git push origin main --follow-tags
```

بعدها من تبويب **Actions → Build Electron Desktop App** تابع التشغيل (نحو 10–15 دقيقة أول مرة، أسرع لاحقاً بفضل الكاش)،
وعند اكتماله ستجد الإصدار في **Releases** مع الملفات الثلاثة وملاحظات مولّدة تلقائياً من عناوين الـ PRs المدمجة.

## إصدار تجريبي للمراجعة (بدون وسم)

1. **Actions → Build Electron Desktop App → Run workflow**.
2. اختر الفرع، وفعّل `publish_draft_release`.
3. بعد الاكتمال: **Releases → Draft** — راجع الملفات والملاحظات ثم اضغط **Publish release**، أو احذف المسودة.

## التحقق من الملفات قبل التوزيع

على جهاز Windows (PowerShell):

```powershell
Get-FileHash .\UnionERP-1.2.0-x64.exe -Algorithm SHA256
# قارن الناتج بالسطر المقابل في SHA256SUMS.txt
```

ثم شغّل النسخة المحمولة وتأكد من:
- فتح النافذة على الشاشة الرئيسية خلال أقل من 90 ثانية (الخادم الداخلي على المنفذ 3000).
- `http://127.0.0.1:3000/api/health` يعيد `"version": "1.2.0"`.
- تسجيل الدخول والتنقل بين البوابات الثلاث (النقابة / مركز التدريب / اللجان) يعملان.

> ملاحظة: الملفات **غير موقّعة رقمياً** (لا توجد شهادة توقيع)، لذا قد يعرض Windows SmartScreen تحذيراً
> عند أول تشغيل — اختر *More info → Run anyway*. لإزالة التحذير نهائياً تلزم شهادة توقيع كود
> تُضاف كأسرار `CSC_LINK` و`CSC_KEY_PASSWORD` في إعدادات المستودع مع تفعيل الاكتشاف التلقائي في سير العمل.

## البناء المحلي (اختياري)

على Windows: انقر نقراً مزدوجاً على `BUILD_ELECTRON_WINDOWS.cmd` أو نفّذ:

```bash
npm ci
npm run electron:build      # الواجهة + الخادم المجمّع + electron-builder (NSIS + Portable) في release/
```

راجع [ELECTRON.md](./ELECTRON.md) لتفاصيل التكوين واستكشاف أخطاء البناء.

## قائمة تحقق سريعة قبل الوسم

- [ ] CI أخضر على `main` (**Union Accounting ERP CI**).
- [ ] `npm test` و`npm run typecheck` يمرّان محلياً.
- [ ] `package-lock.json` متزامن مع `package.json` (`npm ci` ينجح دون أخطاء "Missing from lock file").
- [ ] تحديث ملاحظات/وثائق المزايا الجديدة في `docs/` إن لزم.
- [ ] رقم الإصدار الجديد يتبع الترقيم الدلالي: `major.minor.patch`.
