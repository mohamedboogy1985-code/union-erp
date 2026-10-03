# الأوامر ⇐ JSON ⇐ تنفيذ الدالة (الكلام إلى Function Calling)

هذا المستند يشرح الجولة كاملة: إزاي كلام المستخدم (المكتوب أو المنطوق بعد تحويله نصاً) بيتحوّل
لعقد JSON ثابت، وإزاي نفس العقد بيتنفَّذ على بيانات البرنامج فعلاً — **محلياً بالكامل** بلا أي خدمة خارجية وبلا مفاتيح.

---

## 1) العقد (Contract)

الطلب: نص حر عربي (فصحى/عامية/أرقام هندية/أرقام مكتوبة بالحروف).

المخرج: JSON بالشكل ده بالظبط:

```json
{
  "action": "CREATE_INVOICE",
  "parameters": {
    "client_name": "شركة المقاولون",
    "amount": 5000,
    "type": "electronic"
  }
}
```

- `action` واحد من الأكوان العشرة المسجّلة تحت.
- `parameters` معاملات الأمر الفعلية كما استُخرجت من الكلام (والاسم/المبلغ لا يُخترعان: لو مش موجودين يرجّع `null` وتنخفض الثقة).

بجانب العقد الأساسي، الردود بترجّع كمان نسخة تنفيذية كاملة (`intentJsonFull`) فيها `function` و`execution` و`confidence` — للعرض والتدقيق، من غير ما تغيّر العقد الأساسي.

---

## 2) الأكوان العشرة والدوال المنفَّذة

| action | الدالة المنفَّذة | وضع التنفيذ | أمثلة كلام |
|---|---|---|---|
| `CREATE_INVOICE` | `createInvoice(client_name, amount, type)` | **draft** | «اعمل فاتوره الكترونيه لشركه المقاولون 5000» |
| `GET_PAYROLL` | `getPayroll(month, year)` | direct | «استعلام عن مرتبات شهر سبتمبر 2026» |
| `CREATE_JOURNAL` | `createJournalEntry(description, amount, debit_account, credit_account)` | **draft** | «صرفت 900 جنيه كهرباء من الخزينة» |
| `GET_ACCOUNT` | `getAccountFromChart(code \| name)` | direct | «استخرج حساب 1201 من دليل الحسابات» |
| `QUERY_ENTITY` | `queryEntity(entity_type, name)` | direct | «بيانات لجنة شبين الكوم» • «مكتب شئون عضوية السويس» • «موظف اسمه حنان» |
| `EXTRACT_DATA` | `extractData(dataset, format)` | direct | «استخرج بيانات العاملين» |
| `SEARCH_DATA` | `searchData(keyword, cheque, period)` | direct | «ابحث عن شيك 123456» |
| `OPEN_SCREEN` | `openScreen(screen)` | direct | «افتح شاشة الضرائب» |
| `HELP` | `listCapabilities()` | direct | «مساعدة» |
| `UNKNOWN` | — | — | أي كلام غير مفهوم ⇒ **لا يُنفَّذ** ويُطلب توضيح |

**قاعدة الأمان:** الفواتير والقيود `execution: "draft"` — تُجهَّز وتُحفظ معلّقة، ومفيش ترحيل آلي ولا إرسال لمنظومة الضرائب غير بأمر صريح منك («أرسلها» / «اعتمد»). الاستعلامات والاستخراج تنفيذ مباشر لأنها قراءة فقط.

---

## 3) من الـ JSON للتنفيذ

بعد ما الـ JSON يخرج، البرنامج بياخده و**يحوّله لأمر قانوني واحد** (`intentToCommand`)
ويشغّله على نفس محرّك المساعد (`generalAssistantService.run`) — يعني **الفهم والتنفيذ من نفس المصدر**، فمستحيل الرد يخالف الأمر.

| الكلام | الـ JSON | اللي بيحصل فعلاً |
|---|---|---|
| اعمل فاتوره الكترونيه لشركه المقاولون 5000 | `{"action":"CREATE_INVOICE","parameters":{"client_name":"شركة المقاولون","amount":5000,"type":"electronic"}}` | مسودة فاتورة إلكترونية `INV-2026-00xx`: صافي 5,000 + ضريبة قيمة مضافة 700 = 5,700 ج، محفوظة معلّقة |
| استعلام عن مرتبات شهر سبتمبر 2026 | `{"action":"GET_PAYROLL","parameters":{"month":"سبتمبر","month_en":"september","month_number":9,"year":2026,"basis":"full"}}` | تقرير المسير من بيانات البرنامج + حالة ربط البصمة |
| صرفت 900 جنيه كهرباء من الخزينة | `{"action":"CREATE_JOURNAL","parameters":{"description":"كهرباء","amount":900,"debit_account":"5007","credit_account":"1101"}}` | مسودة قيد: 5007 كهرباء (مدين) / 1201 بنك مصر (دائن) معلّقة على الاعتماد |
| استخرج حساب 1201 من دليل الحسابات | `{"action":"GET_ACCOUNT","parameters":{"account_code":"1201","account_name":null,"query":"1201"}}` | صفوف الدليل الفعلية + تنزيل CSV |
| بيانات لجنة شبين الكوم | `{"action":"QUERY_ENTITY","parameters":{"entity_type":"committee","name":"شبين الكوم"}}` | تحصيل 40,000 ج • اشتراكات 35,000 ج • حصة اللجنة 17,500 ج • النقابة العامة 10,500 ج |
| استعلام عن مكتب شئون عضوية السويس | `{"action":"QUERY_ENTITY","parameters":{"entity_type":"office","name":"السويس"}}` | إيرادات 43,000 ج • 1,000 إيصال |
| استعلام عن موظف اسمه حنان | `{"action":"QUERY_ENTITY","parameters":{"entity_type":"employee","name":"حنان"}}` | أجر شامل 8,286.40 ج • أجر تأميني 8,100 ج • حصة النقابة 414.32 ج |
| استخرج بيانات العاملين | `{"action":"EXTRACT_DATA","parameters":{"dataset":"employees","format":"csv"}}` | 76 سجلاً + ملف CSV |

---

## 4) الواجهات (API)

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/assistant/intent` | POST | `{ text }` ⇒ `{ intent, intentJson, intentJsonFull, executed, result }`. ولو بعت `{ intent: {...} }` جاهز ينفّذه برضه، و`{ execute: false }` يعرض بلا تنفيذ |
| `/api/assistant/intents/schema` | GET | العقد + الدوال العشرة بأوصافها ووضع تنفيذها |
| `/api/assistant/intents` | GET | آخر 50 أمر: الن  ، الـ action، الدالة، الثقة، المستخدم |
| `/api/assistant/run` | POST | نفس المحرّك القديم + `intent` و`intentJson` و`intentJsonFull` مع كل رد |

مثال:

```powershell
curl -X POST http://127.0.0.1:4300/api/assistant/intent `
  -H "content-type: application/json" `
  -H "x-user-id: usr-mohamed-abdallah" `
  -d "{\"text\":\"اعمل فاتوره الكترونيه لشركه المقاولون 5000\"}"
```

والواجهة: زر **JSON** في شريط المساعد العام يعرض الـ JSON المنفَّذ لكل رد، وتحته سطر التنفيذ (`createInvoice(...) • معلّق على اعتمادك`).

---

## 5) استخراج المعاملات (كلها محلية، بلا مزوّد خارجي)

- **تطبيع النص:** توحيد الهمزات/التاء المربوطة/الياء، إزالة التشكيل والرموز، وتحويل الأرقام الهندية (٥٠٠٠ ⇒ 5000).
- **المبلغ:** أول رقم في الجملة بعد استثناء السنوات، مع دعم «5 الف» و«5 آلاف» و«10 مليون».
- **الشهر:** أسماء الشهور العربية + الشهور الإنجليزية + «شهر 9».
- **اسم العميل:** بعد «لشركة/لعميل/لمورد/لصالح» مع الحفاظ على لقب الشركة كما في الكلام.
- **الحساب/الجهة/الموظف:** كود الحساب أو اسم الجهة مع تنقية كلمات الحشو («بيانات»، «استعلام عن»، «اسمه»).
- **الثقة (confidence):** ترتفع لما المعامل الأساسي موجود، وتنخفض لما ناقص (مثلاً مرتبات بلا شهر ⇒ 0.7).

---

## 6) الملفات

| الملف | الدور |
|---|---|
| `server/services/intent-parser.service.ts` | المحلّل: `parseIntent` • `intentToJson` • `intentToJsonFull` • `intentToCommand` • `INTENT_FUNCTIONS` |
| `server/routes/assistant.routes.ts` | المسارات الأربعة + سجل الأوامر (≤200) |
| `server/services/general-assistant.service.ts` | تنفيذ الدوال على البيانات (منها معالج اللجان/المكاتب/الموظفين) |
| `src/components/GeneralAssistantWidget.tsx` | زر JSON وعرض العقد + سطر التنفيذ |
| `test/intent.test.ts` | 16 اختبار وحدة (جوه `npm test`) |
| `scripts/intent-json-check.mjs` | 14 فحصاً حياً على الخادم والواجهة |
