# دليل ربط واستخدام Google Jules مع مستودع GitHub

هذا الدليل يشرح كيفية إعداد وربط مساعد الذكاء الاصطناعي **Jules** من موقع [jules.google.com](https://jules.google.com) بمستودع المشروع على GitHub (`mohamedboogy1985-code/union-erp`).

---

## 1. ما هو Google Jules؟

**Jules** هو مساعد برمجيات ذكي من Google متخصص في كتابة وتعديل الأكواد البرمجية، حل الأخطاء (Bugs)، وإضافة الميزات تلقائياً بداخل مستودعات GitHub مباشرة عبر إنشاء فروع (Branches) وسحبات تعديل (Pull Requests).

---

## 2. خطوات ربط Jules بـ GitHub والمستودع

### الخطوة الأولى: تسجيل الدخول إلى Jules
1. افتح الرابط: [https://jules.google.com](https://jules.google.com).
2. سجل الدخول باستخدام حساب Google الخاص بك.

### الخطوة الثانية: ربط حساب GitHub
1. عند الدخول إلى لوحة تحكم Jules، انقر على **Connect GitHub** أو انتقل إلى قسم **Settings / Integrations**.
2. سيُطلب منك تفويض تطبيق Jules للوصول إلى حسابك في GitHub (GitHub Authorization).
3. اضغط على **Authorize Jules** لربط الحساب.

### الخطوة الثالثة: تحديد المستودع (Repository Selection)
1. اختر تثبيت تطبيق Jules على المستودع المحدد (Only select repositories).
2. اختر مستودع هذا المشروع:
   ```text
   mohamedboogy1985-code/union-erp
   ```
3. اتبع الإرشادات لمنح Jules الأذونات التالية للمستودع:
   - **Read & Write Access** للكود والمستندات (Repository Contents).
   - **Pull Requests**: لإنشاء وقراءة طلبات السحب.
   - **Issues / Workflows** (حسب الحاجة لأتمتة المهمات).

---

## 3. كيفية بدء مهمة مع Jules للمستودع

1. بعد الربط، افتح الواجهة الرئيسية في [jules.google.com](https://jules.google.com).
2. حدد مستودع `mohamedboogy1985-code/union-erp` من القائمة المنسدلة للمشاريع.
3. اكتب طلبك أو المهمة باللغة العربية أو الإنجليزية (مثال: *"قم بإضافة اختبارات جديدة لنظام الحضور والإنصراف"* أو *"قم بإصلاح خطأ في شاشة القيود"*).
4. يقوم Jules بتحليل الكود، إعداد خطة العمل، وتنفيذ التعديلات على فرع جديد في GitHub، ثم تقديم طلب سحب (Pull Request) لتراجعة واعتماده.
5. **توضيح هام حول آليتي التشغيل**: عند قيادة Jules عبر وحدة التحكم بالموقع (jules.google.com) يتم إنشاء Pull Request تلقائياً. أما عند قيادته عبر لوحة التطبيق الداخلية (`/api/jules/*` المتاحة على فرع `arena/01a07898-union-erp`) فإن النظام يعمل بنمط اعتماد الخطة اليدوي (`requirePlanApproval: true`) دون إنشاء Pull Request تلقائي، وتلزم مراجعة الخطة والأنشطة يدوياً داخل اللوحة.

---

## 4. إعداد الخادم والبيئة (Server Environment Setup)

لوحة Jules المدمجة داخل التطبيق متاحة على فرع `arena/01a07898-union-erp`، وتتطلب **وضع الأمان الصارم** (`DEMO_MODE=false`) — فالاتصال بـ Jules محظور تماماً في وضع العرض التجريبي. احفظ كل الأسرار في `.env` على الخادم فقط، ولا ترفع `.env` نفسه إلى Git.

### 4.1 توليد الأسرار العشوائية

أنشئ سرين مستقلين عشوائيين (32 بايت hex)، بتنفيذ الأمر مرتين محلياً:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### 4.2 تمهيد كلمة مرور المدير (بلا كلمة مرور افتراضية)

شغّل الأمر التالي في طرفية تفاعلية محلية — يطلب كلمة المرور وتأكيدها دون إظهارها، ويطبع بصمة bcrypt فقط (تكلفة 12، وبحد أدنى 12 حرفاً وبحد أقصى 72 بايت UTF-8):

```bash
npm run auth:hash-password
```

احفظ البصمة سراً بين علامتي اقتباس مفردتين في `.env`. هذا التمهيد لا يُنشئ مستخدماً جديداً ولا يمنح صلاحيات إضافية؛ المعرّف الافتراضي يشير إلى مدير فعلي نشط يملك صلاحية `system:admin`.

### 4.3 الملف الكامل

```dotenv
# ─── وضع الأمان الصارم (إلزامي لتفعيل Jules) ───
DEMO_MODE=false
JWT_SECRET=<أول سر عشوائي من 4.1>
ENCRYPTION_KEY=<ثاني سر عشوائي من 4.1>

# ─── مدير حقيقي (من 4.2، بدون مسافات داخل البصمة) ───
ERP_ADMIN_USER_ID=usr-mohamed-abdallah
ERP_ADMIN_PASSWORD_HASH='<bcrypt-hash>'

# ─── الاتصال بـ Jules (معطّل افتراضياً) ───
JULES_ENABLED=true
JULES_API_KEY=<مفتاح Jules الخاص بك — ليس مفتاح Gemini>
JULES_REPOSITORY=mohamedboogy1985-code/union-erp
JULES_STARTING_BRANCH=arena/01a07898-union-erp
```

### 4.4 الحصول على مفتاح Jules API

1. بعد ربط المستودع (القسم 2)، افتح إعدادات Jules في [jules.google.com](https://jules.google.com).
2. أنشئ **مفتاح Jules API** من إعدادات Jules. **مفتاح Gemini لا يعمل بدلاً عنه.**
3. خزّنه على الخادم فقط — لا يوجد حقل لإدخاله من المتصفح، ولا تستخدم بادئة `VITE_` لأي سر Jules.
4. الفرع المحدد في `JULES_STARTING_BRANCH` يجب أن يكون منشوراً إلى GitHub ومتاحاً في Jules.

### 4.5 التحقق من الجاهزية

- أعد تشغيل الخادم ثم افتح **Jules — وكيل البرمجة** من القائمة الجانبية.
- سجّل الدخول بكلمة مرور المدير التي ضبطتها في 4.2، واضغط **تحديث**.
- تعني الحالة `ready` و`authenticated` أن الوصول الفعلي جاهز؛ ثم أنشئ مهمة صغيرة للتأكد من ظهور المستودع في `Sources`.
- دون ذلك، ارجع إلى رسائل `problems` في نقطة الحالة (`/api/jules/status`).

> مرجع معمق: لأمن الوحدة والمسارات المحلية وقائمة الأخطاء والحصص، راجع `docs/JULES.md` — ويتوفر في فرع `arena/01a07898-union-erp` (قد يتطلب الدمج قبل أن يعمل الرابط من هذا الفرع).

---

## 5. نصائح وإرشادات هامة

- **الوصول المستهدف**: يفضل دائماً إعطاء Jules صلاحية الوصول للمستودع المحدد فقط (`Only select repositories`) لحماية بقية مشاريعك على GitHub.
- **مراجعة الكود**: قبل دمج أي Pull Request ينشئه Jules، تأكد من تشغيل الاختبارات المحلية باستخدام:
  ```bash
  npm test
  npm run test:jules
  npm run typecheck:jules
  npm run lint
  npm run build
  ```
  
  > ملاحظة: أمري `npm run test:jules` و`npm run typecheck:jules` خاصان بملفات لوحة Jules ويوجدان فقط على فرع `arena/01a07898-union-erp`.
