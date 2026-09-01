# برومت كامل — نظام Union Financial ERP (النقابة العامة)

> هذا وثيقة توجيهية كاملة تُقدَّم إلى أي مساعد ذكاء اصطناعي (برنامج سحابي مثل ChatGPT / Claude / Gemini) ليتمكن من مواصلة العمل على المشروع بدقة، أو إعادة إنتاجه، أو تحليله، دون الحاجة إلى جلسة محادثة سابقة.

---

## 1) الدور المطلوب منك

أنت مهندس برمجيات خبير في بناء أنظمة ERP مالية عربية (RTL) باستخدام React + TypeScript + Node/Express + PostgreSQL. تعمل ضمن مشروع حقيقي موجود الآن على جهازي. مهمتك هي **مواصلة تنفيذ المهام التالية على الكود الفعلي** باتباع الاصطلاحات الموثقة أدناه حرفياً، مع الالتزام الصارم بالشروط (RTL، صفر تعليقات في الكود، إبقاء الاختبارات خضراء).

## 2) البيئة التقنية (مهمة جداً للتوافق)

- نظام التشغيل: **Windows 11**، الصدفة **PowerShell 5.1** (لا يوجد `&&`؛ استخدم `cmd1; if ($?) { cmd2 }`).
- Node.js **v24.18.0**، Electron **44.0.0**.
- المشروع ESM بالكامل: `package.json` يحتوي `"type": "module"`.
- **قاعدة حاسمة:** كل ملفات الواجهة تستخدم استيرادات بلاحقة `.js` حتى وإن كان الملف المكتوب فعلياً `.tsx` (مثال: `import { Combobox } from '../components/Combobox.js';`).
- التحويل البرمجي: Vite 6.4.3. الاختبارات: Node native (مباشرة عبر `node test/...` وليست jest/vitest).
- المظهر: `dark slate-950` + `emerald` للتمويل، `amber` للتنظيم، `violet` للموارد البشرية — خلفية `bg-slate-900/950`، حدود `border-slate-800`، عناوين `text-xs font-bold`.
- **RTL إلزامي:** كل النصوص بالعربية، الجداول `text-right`، الأيقونات على اليمين `absolute right-3.5`.

## 3) مسار الجذر على جهازي

```
C:\Users\HP\Downloads\union-app-main\union-app-main\
```

## 4) بنية المشروع

```
src/
  components/          (Modal.js, PrintHeader.js, ModuleTabs.js, Combobox.js ...)
  pages/               (صفحة مستقلة لكل وحدة وظيفية + الوحدات الموحّدة Hubs)
  services/api.js      (كل استدعاءات الواجهة)
  types/erp.ts         (كل الأنواع مثل JournalEntry, Member, Receipt, Employee ...)
  App.tsx              (الراوتر + خرائط aliases للوحدات)
  components/Layout.tsx(القائمة الجانبية + مصفوفات aliases)
server/
  index.ts  routes/  services/  data/  (Express + Prisma → PostgreSQL)
test/
  *.test.ts            (تشغيل مباشر: node --test  أو npm test)
release/               (حزم Electron المبنية)
dist/                  (خارجة vite build)
```

## 5) الأصناف/الاصطلاحات البرمجية الملزمة

1. **صفر تعليقات في الكود** — لا تضف أي `//` أو `/* */` إلا في نصوص عربية عَرضية تشرح للقارئ فقط إذا كانت موجودة مسبقاً؛ لا تُنشئ جديدة.
2. لا تنسخ مكتبات جديدة إلا بعد التأكد من وجودها بالفعل في `package.json`.
3. أي `select` / `input` بحث نصي على قائمة سجلات موجودة في الواجهة → استبدله بـ **مكوّن `Combobox`** (موجود أدناه) بدلاً من `input` صامت.
4. كل الشاشات تستقبل props بالشكل الثابت:
   ```ts
   interface XProps {
     organizationId: string;
     currentUser: User | null;
     onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
   }
   ```
5. أي عملية تنشئ سجلاً (قيد/إيصال/...) يجب أن تنهي بـ `loadData()` أو `setX(حالة)` ليتم **تحديث القوائم المنسدلة تلقائياً** (هذا شرط المنتج).
6. احترم تنسيق `Prettier` الحالي: اقتباسات مفردة، فاصلة منقوطة، تبويب مسافتان.
7. أوامر التحقق الثابتة (شغّلها بعد كل تعديل):
   - `npx tsc --noEmit -p tsconfig.json` ← الأخطاء *الموجودة مسبقاً فقط* مقبولة (انظر قسم 9).
   - `npm run build` ← يجب أن يبني بنجاح.
   - `npm test` ← يجب أن تبقى كل الاختبارات خضراء.

## 6) الأعمال المكتملة بالفعل (لا تعيدها، واصل منها)

### المرحلة 1 — اللائحة المالية (86 مادة) ✅
- `server/data/financial-regulation.ts`: تحتوي 86 مادة كاملة، 21 قيد سيــد، و16 قاعدة قابلة للتطبيق (`REGULATION_ACTIVATED_RULES`).
- عند إقلاع `server/services/regulation.service.ts` تُفعَّل القواعد المفعلة تلقائياً.
- قواعد تخصصية في `checkJournalEntry(entry, lines)`:
  - صرف نقدي > 20,000 (م9) • نفقات سفر (م37) • انتقال (م39) • أعباء (م40) • هدايا (م50/51 — سقف 200 ج/الهدية) • شراء (م61 — سقف 20,000) مع استثناء القيود العكسية `REVERSAL`.
- `GET /api/regulation` يعيد `document` مع `articles` و`activeRules` و`enforcing`.
- `src/pages/FinancialRegulation.tsx` تعرض اللائحة + الرقابة + قواعد تفعيل.
- شريط تحذيرات اللائحة في أعلى `JournalEntries.tsx` يلتقط `warnings` من الخادم.
- اختبارات `test/regulation.test.ts` (42 اختباراً) كلها خضراء.

### المرحلة 2 — دمج الشاشات في وحدات موحّدة ✅
- `src/components/ModuleTabs.tsx`: شريط تبويبات sticky موحد.
- `src/pages/AccountingHub.tsx` (محاسبة ومالية): JournalEntries + AccountingReports + SubledgerParties + ChartOfAccounts + Banking + Budgets.
- `src/pages/HrsHub.tsx` (الموارد البشرية والعاملين): EmployeeAffairs + Payroll + Attendance + EmployeeAdvances + FixedAssets (أصول ثابتة/معاشات/تكافل).
- `src/pages/MembershipHub.tsx` (العضوية والتحصيل): Members + Receipts.
- `src/pages/AiHub.tsx` (الذكاء الاصطناعي والمساعد الحي): AIAssistant + LiveAgent.
- التنقل: `App.tsx` فيه خرائط aliases (`ACCOUNTING_HUB_ALIASES`, `HRS_HUB_ALIASES`, `MEMBERSHIP_HUB_ALIASES`, `AI_HUB_ALIASES`) و`Layout.tsx` فيه مصفوفات aliases لكل وحدة وتذكرة `key={currentTab}` لإعادة تهيئة الوحدة.
- الوحدات تستقبل وسطاء خاصة: `voiceDraft` إلى Receipts، و`onNavigate` و`onVoiceReceiptDraft` و`onNavigateToJournals` إلى AiHub.
- القائمة الجانبية بها 12 عنصراً: dashboard, accounting📍, membership 📍, hrs📍, promo, budgets, assets, einvoicing, audit, regulation, aihub, settings.

### المرحلة 3 — القوائم المنسدلة الذكية في البحث (طلبتُهُ أنا وأنت نفّذته للتو) ✅
استبدلنا حقل البحث نصي في **9 شاشات** بمكوّن `Combobox` جديد كلياً:
`JournalEntries` (القيد: رقم + بيان + تاريخ) • `SubledgerParties` (الطرف: الاسم + الكود + الهاتف) • `Members` (الاسم + رقم القيد + الشركة) • `ChartOfAccounts` (الكود + الاسم) • `Receipts` (رقم الإيصال + المسدد + المبلغ) • `EmployeeAdvances` (اسم العامل + الغرض + التاريخ) • `AuditLog` (الإجراء + المستخدم + الوقت) • `FinancialRegulation` (المادة المرقّمة + العنوان) • `EmployeeAffairs` (الاسم + الكود + الوظيفة).

**مهم: قائمة القيود تتحدث تلقائياً** لأنها مشتقة من `entries` وأي إنشاء/عكس يستدعي `loadData()`.

## 7) كود مكوّن `Combobox` (أنشئناه — اقتبسه كما هو)

> الملف: `src/components/Combobox.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface ComboboxOption<T = string> {
  id: T;
  label: string;
  sub?: string;
}

interface ComboboxProps<T = string> {
  value: string;
  onChange: (text: string) => void;
  onSelect?: (option: ComboboxOption<T>) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  emptyText?: string;
}

export function Combobox<T = string>({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  className,
  inputClassName,
  emptyText = 'لا توجد نتائج مطابقة',
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 10);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [options, value]);

  useEffect(() => {
    setActive(0);
  }, [value, options, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (option: ComboboxOption<T>) => {
    onChange(option.label);
    onSelect?.(option);
    setOpen(false);
  };

  const hasOptions = options.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={!hasOptions}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, visible.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const target = visible[active];
            if (target) pick(target);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={inputClassName}
      />
      {hasOptions && (
        <Search
          className={`w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${open ? 'text-emerald-400' : ''}`}
        />
      )}
      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 py-1.5">
          {visible.length === 0 ? (
            <div className="px-3 py-2.5 text-[11px] text-slate-500 font-bold">{emptyText}</div>
          ) : (
            visible.map((o, i) => (
              <button
                key={`${String(o.id)}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-right transition-colors ${
                  i === active ? 'bg-emerald-600/10' : 'hover:bg-slate-900'
                }`}
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate">{o.label}</span>
                  {o.sub && <span className="text-[11px] text-slate-500 truncate">{o.sub}</span>}
                </span>
                <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

### نمط الاستخدام القياسي في أي شاشة (مثال JournalEntries — استخدمه كنموذج)

```tsx
import { Combobox } from '../components/Combobox.js';
// ... داخل JSX، مكان حقل البحث:
<Combobox
  value={searchQuery}
  onChange={setSearchQuery}
  placeholder="بحث برقم القيد، البيان، اسم الحساب، أو الطرف المدين..."
  options={entries.map((e) => ({
    id: e.id,
    label: e.entryNumber,
    sub: `${e.description} — ${e.date}`,
  }))}
  className="flex-1 max-w-md w-full"
  inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden transition-colors"
/>
```

**ملاحظات استخدام:**
- `label` يجب أن يكون القيمة التي تناسب فلاتر الشاشة الحالية (رقم فريد أفضل).
- عند الحاجة إلى تعيين بحث مختلف عن `label` (مثل شاشة اللائحة): أضف `onSelect` مثل:
  ```tsx
  onSelect={(o) => setSearchQuery(o.id as string)}
  ```
- احذف استيراد `Search` من `lucide-react` إن كان لم يعد مستخدماً في الشاشة بعد استبدال الحقل.

## 8) المهمة التالية المطلوبة منك (واصل من هنا)

**المهمة 1 (الأهم):** تأكد أن قائمة القيود المنسدلة في `JournalEntries.tsx` تتحدث تلقائياً في *كل* المسارات (إنشاء يدوي، عكس قيد، مزامنة أوفلاين عند `CREATE_JOURNAL`). إذا لم تكن `loadData()` تُستدعى في كل تلك النقاط فأصلح ذلك.

**المهمة 2:** وسّع مفهوم القوائم المنسدلة إلى **كل الحقول القابلة للقوائم** في كل الشاشات، وليس البحث فقط، بنفس نمط `Combobox`:
- حقول النماذج النصية التي كانت تقبل إدخالاً حراً بينما توجد بيانات جاهزة لها (أسماء حسابات عند الاختيار، أسماء جهات، عملاء/موردين، موظفين عند حضور، أسماء أصول، سنوات مالية، بنوك، أنواع إيراد...).
- حددها بالفحص: أي `input type="text"` داخل `Modal` نماذج حيث يوجد مصدر أوتوماتيكي → حوّله إلى `Combobox` مع `observer` (آلية إضافة سريعة) إن لزم.
- لا تُغيّر سلوك الحقول التي هي بالفعل `select` سليمة (لا تحتاج إلا إذا طلبي صريح).

**المهمة 3:** جهّز إعادة بناء حزم Electron:
```
I. أوقف خادم التطوير نهائياً.
II. ابحث عن أي عملية تستمع على المنفذ 3000 (Get-NetTCPConnection -LocalPort 3000 -State Listen) واقتلها — قد يكون هناك "طفل" orphan من tsx watch يمسك مجلد release.
III. نفذ أمر البناء (مثلاً npm run dist أو ما هو في package.json scripts) لتوليد:
      release\UnionERP-1.1.0-x64.exe   و  release\UnionERP-Portable-1.1.0.exe
IV. أعد تشغيل خادم التطوير واختبر /api/health وعدد القيود (كان 35 في آخر فحص).
```

## 9) أخطاء `tsc` المقبولة (موجودة مسبقاً — لا تلمسها)

عند تشغيل `npx tsc --noEmit` ستظهر أخطاء قديمة موجودة قبل أي من أعمالنا، منها:
- `React is declared but its value is never read` في App.tsx وLayout.tsx وبعض الملفات.
- `Search` / `RefreshCw` غير مستخدمين في Layout.tsx وCloudSqlStats.tsx.
- أخطاء أنواع قديمة في `AccountingReports.tsx` (مثل `Property 'accountCode' does not exist...`).
- أخطاء في `src/features/ai-support-agent/` و`src/middleware/auth.middleware.ts` (مسارات لا تعيد قيمة).
- ملفات ActuarialStudio.tsx وDashboard.tsx وأخرى (متغيرات غير مستخدمة).

القاعدة: **لا تُصلح أي خطأ إلا إذا كان ناتجاً عن تعديلاتك أنت** (مثل إزالة استيراد صار قديماً بعد استبداله بـ Combobox). كل الباقي ممنوع لمسه.

## 10) أسئلة تحقق قبل التسليم

1. هل `npm run build` نجح بدون أخطاء block؟
2. هل كل الاختبارات خضراء (`npm test` خرج بـ "ALL ... TESTS PASSED")؟
3. هل كل حقول البحث المتوقعة أصبحت `Combobox` وهي تعرض اقتراحات السجلات عند التركيز؟
4. هل القوائم تتحدث تلقائياً بعد إنشاء سجل جديد (تحديث حالة → إعادة render)؟
5. هل حزمتا Electron في `release\` مؤرختا اليوم وتشمل أحدث الكود؟

## 11) مجال العمل فقط

لا تغيّر: اللائحة المالية (data) • إعدادات قواعد اللائحة • منطق الخادم المالي الأساسي • الأنواع في erp.ts إلا للضرورة مع تحديث كامل لكل الاستخدامات. ركّز على الواجهة (src/pages + src/components) ما لم تُطلب مهمة خادم صراحة.

---

**الرد النهائي المتوقع منك** بعد التنفيذ يجب أن يلخص: الملفات المعدلة (مسارات)، ماذا غُيّر في كلٍّ منها، نتيجة `npm run build`، نتيجة `npm test`، وموقع الحزمتين الجديدتين — بالعربية، باقتضاب.