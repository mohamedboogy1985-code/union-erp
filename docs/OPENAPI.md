# وثيقة OpenAPI — Union ERP (P2)
## سرب أدوات ERP (`Swarm`)

| المسار | الطريقة | الوصف |
| --- | --- | --- |
| `/api/swarm/tools` | GET | سجل الأدوات المتاحة للمستخدم (`readOnly` دائماً، `permission`، `available`) |
| `/api/swarm/tasks` | POST / GET | إنشاء مهمة (خطة + حالة نجاح متوقعة لكل خطوة) · قراءة المهام من الخادم |
| `/api/swarm/tasks/:id/run` | POST | تنفيذ خطوة واحدة |
| `/api/swarm/tasks/:id/run-all` | POST | تنفيذ الخطة حتى حالة نهائية (`VERIFIED` بتحقق مستقل وأدلة، وإلا `FAILED`/`BLOCKED`) |

التفاصيل: `docs/SWARM_ERP_TOOLS.md`.


> نقطة التوثيق الآلية: `GET /api/system/openapi.json` — وتحتاج هوية موثّقة مثل بقية نقاط `/api`.

## كيف تستخدمها

```bash
# في وضع العرض التجريبي (ترويسة هوية صريحة لمستخدم قائم)
curl -H 'x-user-id: usr-admin' http://localhost:3000/api/system/openapi.json | jq '.paths | keys'
# في الإنتاج
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/system/openapi.json | jq
```

الوثيقة تُبنى من `OPENAPI_PATHS` في `server/routes/system.routes.ts` — قائمة مكتوبة يدوياً
تحتوي **مسارات مسجّلة فعلاً** فقط. يحرس `test/production-hardening.test.ts` هذا الشرط:
أي مسار في الوثيقة غير موجود في شيفرة الخادم يُسقط الاختبار، فلا تتقادم الوثيقة بصمت.

## المجموعات الموثّقة حالياً

| المجموعة | النقاط |
|---|---|
| System | `/api/health`، `/api/system/health-detailed`، `/api/system/metrics`، `/api/system/openapi.json` |
| Accounting | `/api/accounts`، `/api/journal-entries` |
| Reports | `/api/reports/trial-balance`، `/api/reports/general-ledger`، `/api/reports/income-expense`، `/api/reports/receipts-payments` |
| Skills | `/api/skills`، `/api/skills/summary`، `/api/employee-skills`، `/api/training-programs`، `/api/training-enrollments`، `/api/ai-agent-skills`، `/api/accounting-procedures` |
| Assistant | `/api/operator-assistant/status` |
| Audit | `/api/ledger-chain/verify`، `/api/audit-logs` |

## الصلاحيات

| النقطة | الصلاحية المطلوبة |
|---|---|
| `/api/system/metrics` و`/api/system/health-detailed` | `system:admin` |
| `/api/system/openapi.json` | أي مستخدم موثّق |
| `/api/health` | عامة (بلا هوية) |

## ما لا تشمله الوثيقة

- **Swagger UI**: لا توجد تبعية `swagger-ui-express` في المشروع، فلا تُخدَم واجهة تفاعلية —
  الوثيقة JSON فقط. (لم يُضَف أي اعتماد جديد لهذا السبب.)
- مسارات المراحل اللاحقة (RAG/pgvector، بوابة AI الموحدة) — تُضاف عند تنفيذ المرحلة P3.

## المقاييس (Prometheus)

`GET /api/system/metrics` يعرض نص Prometheus القياسي (`text/plain; version=0.0.4`):

| المقياس | النوع | المعنى |
|---|---|---|
| `union_erp_requests_total` | counter | إجمالي الطلبات التي انتهت |
| `union_erp_requests_by_status{status}` | counter | توزيع الطلبات على حالات HTTP |
| `union_erp_slow_requests_total` | counter | طلبات أبطأ من 500ms |
| `union_erp_ai_requests_total` | counter | نداءات خدمات الذكاء الاصطناعي (تُزاد من طبقة الذكاء) |
| `union_erp_slow_queries_total` | counter | استعلامات قاعدة بيانات أبطأ من 500ms |
| `union_erp_uptime_seconds` | gauge | مدة تشغيل العملية |
| `union_erp_store_*` / `union_erp_cache_memory_keys` | gauge | قراءات لحظية من المتجر والكاش |

`?format=json` يعرض اللقطة نفسها كـ JSON. إعداد الكشط في `monitoring/prometheus.yml`
(مع ترويسة الهوية المطلوبة)، وتزويد Grafana في `monitoring/grafana/`.
