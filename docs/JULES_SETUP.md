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

## 4. متطلبات إعداد الخادم والبيئة (Server Environment Setup)

إذا كنت تستخدم لوحة Jules المدمجة في خادم التطبيق المحلي، يلزم ضبط أسرار البيئة المتوافقة مع وضع الأمان الصارم:

```dotenv
DEMO_MODE=false
ERP_ADMIN_USER_ID=usr-mohamed-abdallah
ERP_ADMIN_PASSWORD_HASH='<bcrypt-hash>'
```

لمزيد من التفاصيل المعمقة حول أمان لوحة Jules والمسارات المحلية، يرجى مراجعة [docs/JULES.md](./JULES.md) في فرع `arena/01a07898-union-erp`.

---

## 5. نصائح وإرشادات هامة

- **الوصول المستهدف**: يفضل دائماً إعطاء Jules صلاحية الوصول للمستودع المحدد فقط (`Only select repositories`) لحماية بقية مشاريعك على GitHub.
- **مراجعة الكود**: قبل دمج أي Pull Request ينشئه Jules، تأكد من تشغيل الاختبارات المحلية باستخدام:
  ```bash
  npm test
  npm run lint
  ```
