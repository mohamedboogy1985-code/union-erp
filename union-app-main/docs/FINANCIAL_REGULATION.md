# اللائحة المالية المرفقة — طريقة الإدراج والتطبيق

> **الحالة:** هيكل تطبيق كامل جاهز — بانتظار نص الوثيقة الرسمي (تعطلت قناة رفع المرفقات أثناء الجلسة الأولى).
> الصفحات الـ19 ستحوَّل إلى صور وتُقرأ مادة مادة فور وصولها.

## الطبقتان

### 1) طبقة المعرفة — `server/data/financial-regulation.ts`
مصفوفة `FINANCIAL_REGULATION_ARTICLES` تُملأ **بالنص الحرفي** لكل مادة:
```ts
{
  articleNo: '28',
  title: 'سلطات الاعتماد على القيود',
  text: 'نص المادة كاملاً كما ورد…',
  category: 'القيد والاعتماد وسلطات الصرف',
  keywords: ['اعتماد', 'سلطة', 'حدود الصرف'],
  enforcementRuleIds: ['MAX_JOURNAL_ENTRY_AUTO_APPROVE'],
}
```
النتيجة فوراً: المساعد الذكي يجيب «ما نص المادة 28؟» من اللائحة نفسها، وتتصدر موادها نتائج البحث (درجة 5).

### 2) طبقة الإنفاذ — `server/services/regulation.service.ts`
قواعد آلية جاهزة خاملة. كل قاعدة تنتظر قيمتها من المادة، وتُرقَّم بإحدى طريقتين:

**أ) مباشرة في الكود** (عند تعبئة الوثيقة):
```ts
regulationService.configureRule('MAX_JOURNAL_ENTRY_AUTO_APPROVE', 500000, '28', { severity: 'BLOCK' });
```

**ب) عبر الـ API بصلاحية مدير النظام** (دون تعديل كود):
```http
POST /api/regulation/configure
{ "ruleId": "DOCUMENT_REQUIRED_ABOVE", "value": 100000, "articleNo": "31", "severity": "WARN" }
```

القواعد الجاهزة حالياً (كلها في `REGULATION_THRESHOLDS_SEED`):

| القاعدة | المجال | ما يُستخرج من اللائحة |
|---|---|---|
| `FISCAL_YEAR_START_MONTH` | فترات مالية | بداية/نهاية السنة المالية |
| `MAX_JOURNAL_ENTRY_AUTO_APPROVE` | قيود | حد سلطة الاعتماد على القيد الواحد |
| `DOCUMENT_REQUIRED_ABOVE` | قيود | حد إلزامية المستند المؤيد |
| `PETTY_CASH_CEILING` | خزينة | سقف النثرية |
| `ADVANCE_SETTLEMENT_DAYS` | سلف | مهلة تسوية السلفة |
| `ADVANCE_MAX_PERCENT_OF_SALARY` | سلف | سقف السلفة كنسبة من الأجر |
| `REVENUE_DISTRIBUTION_MANDATE` | توزيع | النسب الملزمة لكل جهة (JSON) |
| `RECEIPT_BOOK_WRITING_RULES` | إيصالات | ضوابط التحرير (نصية) |

## نقاط الإنفاذ الموصولة الآن
- `AccountingService.createJournalEntry` → `checkJournalEntry` (BLOCK يرفض الإنشاء، WARN يظهر في `warnings`)
- `EmployeeAffairsService.addAdvance` → `checkEmployeeAdvance` (BLOCK يرفض، WARN إشعار)
- `POST /api/revenue-distribution-rules` → `checkDistributionPercentages`

## الاختبار والحالة
- `test/regulation.test.ts` (7 اختبارات) ضمن `npm test`.
- `GET /api/regulation` يعرض: المواد المعبأة + القواعد النافذة + ما ينتظر الترقيم.
- **ضمان السلامة:** قبل التعبئة كل القواعد خاملة (`enabled=false`, `value=null`) ⇒ لا أي تغيير في السلوك الحالي، والأجنحة الـ36 (8+14+7+7) كلها خضراء.
