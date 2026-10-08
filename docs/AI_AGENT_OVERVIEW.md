# نظرة عامة — الوكيل الذكي المتكامل في Union ERP

> **المصدر**: مستند PR #24/#26 — استُعيد في `docs/CLOSED_PR_REVIEW.md` (الفصل 8، مرحلة P1).
> **تصحيح إلزامي عند الاستعادة**: أُزيلت كل أرقام الأداء غير المقيسة (مثل «1247 استعلام»، «دقة 94%»، «892 فاتورة»، «1.2 ثانية»، «23 شذوذ») وكل الإحالات إلى مسارات متقاعدة، التزاماً بعقد منع تصنيع البيانات — `docs/AI_AGENT_AUDIT.md` بند **P0‑1** و`test/ai-no-fabrication.test.ts`. أي رقم أداء يجب أن يُقاس فعلياً (`npm run eval:ai`) لا أن يُكتب في مستند.
> **الشاشة**: `src/pages/AiAgentOverview.tsx` — تبويب `overview` داخل `AiHub` (متاح في كل البوابات).
> **مسار التبويب**: التبويب متاح، وشاشة البداية الحالية لـ `AiHub` تظل كما هي (`swarm`/`customagent` حسب بوابة الدخول) لعدم تغيير سلوك المستخدم الحالي.

## أربع قدرات مبنية على كود قائم

| # | القدرة | المسارات الفعلية | ملفات التنفيذ |
|---|---|---|---|
| 1 | **المستشار المالي الذكي** — Financial Copilot | `POST /api/ai/query` • `/api/ai/accountant-chat` • `/api/ai/global-chat/stream` (SSE) | `src/pages/AIAssistant.tsx` • `src/pages/AccountingChat.tsx` • `server/routes/ai.routes.ts` • `server/services/ai.service.ts` |
| 2 | **التحويل الصوتي إلى قيود** — Voice-to-Journal | `/api/ai/voice-dictation` • `/api/ai/voice-intention` • `/api/operator-assistant` (مساعد محاسبك) | `src/pages/LiveAgent.tsx` • `src/components/OperatorAssistant.tsx` • `server/routes/operator-assistant.routes.ts` |
| 3 | **قراءة الفواتير والمستندات** — OCR Engine | `/api/ai/ocr-process` • `/api/ai/suggest-journal` • `/api/documents/upload` | `src/pages/AIAssistant.tsx` (تبويب OCR) • `server/services/ai.service.ts` |
| 4 | **التدقيق وكشف الشذوذ** — Forensic Audit | `/api/ai/anomalies` • `/api/ledger-chain/verify` • `/api/ledger-chain/rebuild` | `server/services/ledger-chain.service.ts` • `src/pages/AuditLog.tsx` |

> **ملاحظة**: مسار `/api/live-agent` (WebSocket) **متقاعد** ويعيد `410 Gone` بعد استبداله بـ Operator Assistant — لا يجوز ذكره كنقطة نهاية حيّة.

## 1) المستشار المالي الذكي

- **المحرك**: نماذج Gemini متعددة مع بديل عند تعذّر النموذج الأساسي (`server/services/ai.service.ts`)، مدعوم بقاعدة معرفة اللائحة المالية ومجموعات المرادفات المحاسبية في `server/services/smart-agent.service.ts`.
- **حالة اللائحة**: الوثيقة 86 مادة، والقواعد الرقمية المفعَّلة في المحرك مرقّمة بالمادة (`articleNo`) في `server/data/financial-regulation.ts`.
- **القدرات**: تحليل رصيد 1301 وأكبر الأطراف، اقتراح قيود متوازنة، تلخيص الموقف المالي وصافي الفائض/العجز، شرح فصل المهام وسلطات الاعتماد، وإظهار المصادر مع الإجابة.
- **عند التعذّر**: تُعلن الحالة صراحةً (`AI_UNAVAILABLE`) ولا تُقترح بيانات — انظر `test/ai-no-fabrication.test.ts`.

## 2) التحويل الصوتي إلى قيود

- التعرف على العربية (ar-EG) عبر Web Speech، ثم تحويل الأمر إلى **مسودة** قيد أو إيصال أو أمر تنقّل.
- مساعد «محاسبك» (`OperatorAssistant`) به بوابة موافقة صريحة، ويعمل بلا مفتاح خارجي في مسار الردّ المحلي.
- الإملاء غير المفهوم يعود `UNPARSEABLE` بلا مبلغ أو طرف مُخترع.
- مسوّدات الإيصالات تُحفظ بحالة `draft` حتى التأكيد.

## 3) قراءة الفواتير — OCR Engine

- رفع صورة/نص فاتورة مع تصغير الصور على العميل قبل الإرسال.
- استخراج: اسم المورد، رقم الفاتورة، التاريخ، الإجمالي، الضريبة (14% عند وجودها في المستند).
- توجيه الطرف إلى **1301 مدينون متنوعون**.
- **القيد المقترح لا يُرحَّل تلقائياً**: يمرّ على بوابات التحقق ثم يُعتمد بشرياً (`server/services/accounting.service.ts`).

## 4) التدقيق وكشف الشذوذ

أنماط الشذوذ المفحوصة: `OFF_HOURS_POSTING` • `DUPLICATE_AMOUNT` • `SPLIT_TRANSACTION` • `ROUND_NUMBER_ANOMALY` • `DEBTOR_SPIKE`.

سلسلة التجزئة SHA-256 على الأستاذ تتيح التحقق من عدم التلاعب (`/api/ledger-chain/verify`) وإعادة البناء (`/api/ledger-chain/rebuild`).

## بنية التكامل

```
Frontend (AiHub → AiAgentOverview)
   ├─ Overview Tab (هذا المستند)
   ├─ AI Studio (CHAT / OCR / ANOMALIES / VOICE)
   ├─ Accounting Expert
   ├─ Custom Agent Studio
   └─ مساعد محاسبك (Operator Assistant)

Backend (Express)
   ├─ /api/ai/*                (Gemini + قاعدة المعرفة + OCR + كشف الشذوذ)
   ├─ /api/operator-assistant  (مساعد محاسبك — بديل /api/live-agent المتقاعد)
   ├─ /api/ledger-chain/*      (سلسلة تجزئة SHA-256)
   └─ /api/skills/*            (نظام المهارات الموحد)
```

## القياس بدل الادعاء

لا يحتوي هذا المستند ولا شاشة النظرة العامة على أي رقم أداء مكتوب يدوياً. القياس المتاح:

```bash
npm run eval:ai               # مجموعة التقييم الثابتة (بلا مفتاح API)
npm run test:ai-no-fabrication  # حراسة عقد عدم التصنيع
```

القيم التي تعرضها الشاشة في لوحة «حالة النظام» تُقرأ لحظياً من `/api/health` و`/api/skills/summary`، وأي قيمة غير متاحة تُعرض «—».

## التوفر في البوابات

- تبويب `overview` داخل `AiHub`.
- شاشة المهارات (`skills`) متاحة في **كل البوابات** عبر `portals.ts`.
