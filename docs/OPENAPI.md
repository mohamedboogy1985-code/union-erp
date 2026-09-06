# OpenAPI / Swagger — Union ERP — P2

> نقطة التوثيق التلقائي: `GET /api/system/openapi.json` + واجهة Swagger في `GET /api/docs`

## كيف تشغل

```bash
# الخادم يولد المواصفة تلقائياً من المسارات المسجلة
curl http://localhost:3000/api/system/openapi.json | jq
# افتح Swagger UI
open http://localhost:3000/api/docs
```

## المجموعات الرئيسية

| المجموعة | البادئة | وصف |
|----------|---------|-----|
| Health | `/api/health`, `/api/system/health-detailed`, `/api/system/metrics` | صحة النظام + Prometheus |
| Auth | `/api/auth/*`, `/api/security/*` | تسجيل دخول + JWT + 2FA + RBAC |
| Accounts | `/api/accounts`, `/api/accounts/history` | دليل الحسابات + سجل تاريخ |
| Subledger | `/api/subledger-parties`, `/api/subledger-parties/merge` | أستاذ مساعد 1301 |
| Journals | `/api/journal-entries`, `/api/journal-templates` | قيود يومية + قوالب |
| Reports | `/api/reports/*` | ميزان مراجعة، أستاذ، إيرادات/مصروفات، ميزانية عمومية |
| Receipts | `/api/receipts`, `/api/revenue-distribution-rules`, `/api/verify-receipt/:token` | تحصيل + توزيع + QR |
| Members | `/api/members`, `/api/membership-certificates` | عضوية + شهادات |
| Banking/Budgets | `/api/bank-accounts`, `/api/budgets`, `/api/fixed-assets`, `/api/audit-logs` | بنوك وموازنات وأصول |
| HR | `/api/employees`, `/api/employee-affairs`, `/api/employee-advances`, `/api/attendance/*`, `/api/payroll/*` | شئون عاملين + حضور + مرتبات |
| AI Gateway | `/api/ai/gateway/chat`, `/api/ai/lookup-accounts`, `/api/ai/query-erp`, `/api/ai/reports/:action`, `/api/ai/stream` (SSE), `/api/ai/eval/status` | بوابة AI موحدة P1+P2 |
| RAG | `/api/system/rag/stats`, `/api/system/rag/seed`, `/api/system/rag/search?q=` | بحث دلالي P2 |
| System | `/api/system/cache-stats`, `/api/system/cache/clear`, `/api/system/refresh-materialized-views`, `/api/system/mv/status`, `/api/system/audit-report`, `/api/system/openapi.json`, `/api/docs` | نظام |
| Regulation | `/api/regulation`, `/api/regulation/document`, `/api/regulation/configure` | لائحة مالية |
| OCR | `/api/ocr/process`, `/api/ocr/records` | معالجة مستندات |
| DMS | `/api/documents/*` | أرشيف مستندات + توقيع |
| Actuarial | `/api/actuarial/funds`, `/api/actuarial/simulate` | صناديق اكتوارية |

## مثال مواصفة JSON (مقتطف)

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Union ERP API", "version": "1.1.0" },
  "paths": {
    "/api/accounts": {
      "get": {
        "summary": "قائمة الحسابات مع بحث وترقيم",
        "parameters": [
          { "name": "search", "in": "query", "schema": { "type": "string" } },
          { "name": "page", "in": "query", "schema": { "type": "integer" } },
          { "name": "limit", "in": "query", "schema": { "type": "integer" } }
        ]
      }
    }
  }
}
```

## إنتاج Swagger UI

الخادم يخدم Swagger UI تلقائياً عبر `swagger-ui-express` إن كان مثبتاً، وإلا يعيد JSON فقط.
لتثبيت:

```bash
npm i swagger-ui-express
```

ثم افتح `/api/docs`.
