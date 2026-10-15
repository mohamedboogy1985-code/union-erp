# تنظيف المستودع من البيانات الخاصة (خطوة بخطوة)

> سبب الوثيقة: تقرير فحص 14 أكتوبر 2026 — المستودع عام ويحوي بيانات عاملين وصوراً وسجلات وملفات patch ضخمة.
> **حذف الملف من آخر commit لا يكفي**: يبقى في تاريخ git ويمكن لأي أحد استعادته.

## 0. الآن: اجعل المستودع خاصاً مؤقتاً
GitHub → Settings → General → Danger Zone → **Change visibility → Private**.
(يوقف الانكشاف فوراً أثناء التنظيف. لا يمحو ما نُسخ سابقاً من نسخ/forks.)

## 1. أزل من التتبّع ما لا يحتاجه الكود
```bash
node scripts/untrack-private-files.mjs            # معاينة
node scripts/untrack-private-files.mjs --apply    # تنفيذ
git commit -am "chore: untrack logs, patches and private files"
```
القائمة تشمل فقط ملفات لا يشير إليها أي كود تشغيل (سجلات، ملفا patch بحجم 11MB، صور/ملفات مكتبية في الجذر).

## 2. امسح التاريخ (git filter-repo)
```bash
pip install git-filter-repo
git clone --mirror https://github.com/mohamedboogy1985-code/union-erp.git union-erp-clean.git
cd union-erp-clean.git
# أنشئ paths.txt: سطر لكل مسار/نمط (راجع أسماء الملفات من الخطوة 1 و§3)
git filter-repo --invert-paths --paths-from-file ../paths.txt
git remote add origin <عنوان-المستودع-الجديد-أو-نفسه>
git push --force --all && git push --force --tags
```
بعدها: اطلب من كل من استنسخ المستودع إعادة الاستنساخ، وأرسل طلباً إلى GitHub Support لإزالة الـ commits المخزّنة مؤقتاً (cached views) إن لزم.
**خذ نسخة احتياطية كاملة قبل أي `--force`.**

## 3. ملفات يقرؤها الكود (تحتاج قرارك)
هذه مُشار إليها في كود التشغيل ولذلك لم يُزلها السكربت. القائمة الكاملة تظهر في مخرجات `untrack-private-files.mjs`. وكذلك:

| المسار | ما فيه | الاقتراح |
|---|---|---|
| `server/data/استمارة_2_تأمينات.csv` | أسماء وأجور 76 عاملاً | نقله إلى `private-data/` (مُتجاهَل) مع ملف عيّنة مولَّد بأسماء وهمية يُستخدم في الاختبارات وCI |
| `server/data/insured-list.csv` | أسماء ومهن وتواريخ ميلاد | نفسه |
| `assets/avatars/*` | صور أشخاص بأسمائهم | الحصول على موافقتهم الكتابية أو استبدالها بصور رمزية |
| ملفات Excel/Word في الجذر المُشار إليها | بيانات مالية وقوائم | نقلها إلى `private-data/` وتعديل المسارات في `data-paths.ts` |

لأن `.gitignore` يستثني `server/data/` صراحةً (`!server/data/**`)، حدّد أولاً أي ملفات هناك حقيقية وأيها مرجعي (لوائح وقوانين عامة تبقى).

## 4. قانونياً
البيانات تخص أشخاصاً حقيقيين؛ قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020 قد ينطبق. استشر مستشاراً قانونياً بشأن واجب الإبلاغ، ولا تعتمد على هذه الوثيقة كرأي قانوني.

## 5. بعد التنظيف
- فعّل **Secret scanning** و**Push protection** في GitHub.
- ضع `private-data/` في النسخ الاحتياطي المحلي المشفّر (المشروع فيه `models-crypto.service.ts` لتشفير المكتبات).
