# تحصين AetherSwarm — الخيار «أ» (تصلّب السرب القائم)

> قرار المالك: **الخيار رقم 1 = «أ. تصلّب السرب القائم»** من `docs/SWARM_PROPOSAL_EVALUATION.md` §5.
> العقود الأربعة (§3) تُطبَّق **داخل سطح AetherSwarm القائم** — مع استبدال العرض الافتراضي الملفَّق بطلب ERP حقيقي.

## 1. المشكلة التي كانت

سطح AetherSwarm كان أشبه بمسرح: خطة جاهزة بمقارنة أسعار «RTX 5090»، وستة وكلاء بأسماء
تطبيقية (**BrowserWorker/WindowsExecutive/VisionInspector**) لا يملكون أي تنفيذ حقيقي، ومحاكاة نصية
تُعيد بيانات مُعدّة مسبقاً (`Amazon US`, `Newegg`, `C:\Users\Workspace\RTX5090_Comparison.xlsx`،
«Return Code 0»)، وسجلات تدقيق مزروعة بثقة **0.95–1.0**، ومحاكي موارد يبثّ CPU/RAM عشوائياً
لوكلاء **ليسوا عمليات نظام تشغيل**. الخلاصة: ادعاءات بلا دليل — وهو ما وثّقته `docs/AI_AGENT_AUDIT.md`.

## 2. ما نُفِّذ

### أ) الخطة صارت من أدوات حقيقية
`server/services/swarm/aether-orchestrator.service.ts` (جديد، 456 سطراً):

| الوظيفة | المضمون |
| --- | --- |
| `aetherAgents()` | أربعة وكلاء حقيقيين فقط: المنسّق · وكيل دفاتر الحسابات · وكيل المستندات · المتحقّق المستقل — **وأدوات كل وكيل تُقرأ من السجل الفعلي** لا تُكتب يدوياً |
| `createAetherSession()` | يبني الخطة عبر محرّك الأدوات الحقيقي (`createSwarmTask` + `selectSwarmTools`)، ويضمن **خطوة تحقق مستقلة إلزامية** (`ledger.verify-chain`) |
| `executeAetherStep()` | ينفّذ عبر `runSwarmStep` ببوابة الصلاحيات، ويربط الفشل بسببه، ويحوّل النتيجة إلى عقد الخطوة |
| `resolveAetherConflict()` | تحكيم **بقاعدة أدلة**: بلا أدلة ⇒ `resolved: false` و`finalConfidence: 0`؛ بمصدر واحد ⇒ لا حسم؛ بخطوة فاشلة ⇒ لا حسم |
| `aetherVerdictMessage()` | الحكم النهائي بنص صريح: نجاح مُتحقَّق، أو سبب الفشل الحقيقي، أو «لا توجد أداة مطابقة» |

### ب) سطح المسارات أُعيد كتابته
`server/routes/aetherswarm.routes.ts` (917 → 454 سطراً):

```
POST /api/swarm/orchestrate     → خطة من سجل الأدوات + حالة مهمة على الخادم (taskId)
GET  /api/swarm/task/:id        → حالة المهمة كاملة (الخطة/الأدلة/الفشل/التحقق)
POST /api/swarm/execute-step    → تنفيذ خطوة واحدة بأداة حقيقية (يستلزم taskId)
POST /api/swarm/resolve-conflict→ تحكيم بقاعدة أدلة (بلا أدلة ⇒ لا حسم)
POST /api/gemini/transcribe     → نسخ صوتي (النموذج المعلن في ai.service)
POST /api/gemini/chat           → محادثة (نماذج AI_MODELS فقط)
POST /api/gemini/live-converse  → رد صوتي لحظي (وبديل محلي بلا ادعاء بيانات)
```

حُذف من الملف: `generateCognitiveSwarmPlan` (خطة RTX)، `simulateCognitiveStepRaw`/`simulateCognitiveStep`
(النصوص المُعدّة مسبقاً)، ومصفوفة الوكلاء الستة، وحقل `desktopAction` (لا تحكّم بنظام التشغيل).
الهوية في كل المسارات: **JWT/ERP فقط** (نفس حارس بقية المشروع) — لا هوية ثانية.

### ج) الواجهة توقّفت عن التصنيع
- `src/aetherswarm/AetherSwarmApp.tsx`: حُذف البذر المبدئي (الوكلاء الستة، خطة RTX، أسعار الكروت،
  حقائق «Windows 11 / Chrome 122 / 32GB GDDR7»، سجلات تدقيق «VERIFIED» بثقة 0.99). البديل:
  أربعة وكلاء حقيقيون، وخطة فارغة حتى يطلب المستخدم، وحالة مهمة تُقرأ من الخادم (`taskId`)،
  ورسالة ختامية هي **حكم الخادم** لا جملة «اكتمل كل شيء بنجاح».
- `src/aetherswarm/components/AgentMonitor.tsx` (564 → 220 سطراً): لا CPU/RAM/شبكة عشوائية بعد الآن.
  يعرض حالة التنفيذ الفعلية وعدد الخطوات المنجزة وأدوات كل وكيل من السجل، مع سطر توضيحي:
  «لا قياس موارد: الوكلاء أدوات قراءة على الخادم، لا عمليات على جهازك».
- `src/aetherswarm/utils/desktopMock.ts`: بلا ملفات ولا أسعار مبدئية (`INITIAL_FILES`/`INITIAL_PRODUCTS` فارغان).
- التبويب الافتراضي صار «السرب» بدل سطح المكتب الافتراضي.

### د) ما يُعلنه السطح صراحةً عند تعذّر التنفيذ
- طلب بلا أداة مطابقة ⇒ `plan: []` و`verdict: «لا توجد أداة حقيقية في السجل تطابق هذا الطلب — لم يُنفَّذ شيء.»`
- أداة محجوبة ⇒ `status: BLOCKED` و`blockedByPermission` معلن في الاستجابة.
- خطوة فاشلة ⇒ `failure.reason` من البيانات (لا «خطأ غير معروف»)، وإعادة تخطيط واحدة معلنة باسم البديل.
- الثقة **شرطية لا تقديرية**: `1` عند نتيجة حتمية بأدلة فعلية، و`0` عند غيابها — لا 0.96 ولا 0.99.

## 3. العقود الأربعة كما تُقاس الآن

| العقد | أين يعيش | كيف يُقاس |
| --- | --- | --- |
| TaskState على الخادم | `task-state.service.ts` + `GET /api/swarm/task/:id` | الواجهة لا تُرسل `previousResults`: تقرأ الحالة من الخادم |
| عقد لكل خطوة | `SwarmStepContract` (`expectedState`/`verification`/`maxRetries`/`fallbacks`) | كل خطوة في `taskGraph` تحمل `contract` ظاهراً في الواجهة |
| كاشف فشل + إعادة تخطيط محدودة | `runSwarmStep` | `maxReplans = 1`، وكل فشل مسجَّل بسببه و`detectedBy` |
| بوابة دليل قبل النجاح | `finalizeTask` | لا `VERIFIED` بلا تحقق مستقل (`ledger.verify-chain`) ولا بلا `evidence` |

## 4. الاختبارات

`test/aether-swarm.test.ts` (6 اختبارات، `npm run test:aether-swarm`):

1. أدوات الوكلاء الأربعة كلها من السجل، وكل أداة لها مالك واحد (ولا وكيل متصفح/ويندوز/رؤية).
2. طلب محاسبي ⇒ خطة فيها خطوة تحقق مستقل، و`riskLevel = SAFE`، وبلا أي ذكر لنظام تشغيل المستخدم.
3. طلب تحكّم بالحاسوب ⇒ بلا خطة، و`provenance = UNAVAILABLE`، وحكم «لا توجد أداة حقيقية».
4. تنفيذ خطوة ⇒ `desktopAction: null`، وثقة ∈ {0,1}، وسجلات من التنفيذ.
5. التحكيم ⇒ بلا أدلة: لا حسم والثقة 0؛ بمصدر واحد: لا حسم.
6. الحكم النهائي يُطابق حالة المهمة (VERIFIED/BLOCKED/FAILED/قيد التنفيذ).

## 5. Firebase: المفتاح خارج Git (قرار §6.1)

- حُذف `firebase-applet-config.json` (الجذر و`src/aetherswarm/`) من المستودع، وأُضيف إلى `.gitignore`،
  مع قالب بلا أسرار: `firebase-applet-config.example.json`.
- الإعداد يُقرأ من متغيرات `VITE_FIREBASE_*` (مذكورة في `.env.example`). غيابها ⇒ `firebaseConfigured = false`،
  وتُعطَّل المزامنة السحابية صراحةً في واجهة «حساب المستخدم» بدل ادعاء الاتصال.
- حُذف مسار الهوية الثانية على الخادم (كان ميتاً أصلاً): `src/middleware/auth.ts` و`src/lib/firebase-admin.ts`
  و`src/lib/firebase.ts` — لا شيء كان يستوردها، وهوية النظام هي JWT + سجل التدقيق المتسلسل.
- أُزيلت تبعية `firebase-admin` من `package.json`.
- **مطلوب من المالك (لا يمكن تنفيذه من المستودع):** تدوير مفتاح `AIzaSy…IJQvRk` من
  Google Cloud → APIs & Services → Credentials — حذف الملف من Git لا يُبطل مفتاحاً نُشر في التاريخ.

## 6. ما لم يُغيَّر (مؤجَّل بقرار واعٍ)

- `WindowsDesktopWorkspace.tsx` ما زال سطح مكتب افتراضياً (نوافذ Chrome/Excel/PowerShell شكلاً فقط،
  بلا أي تنفيذ). بقاؤه معروض للنقاش: إما تحويله إلى عارض لنتائج أدوات ERP، أو حذف التبويب.
- نافذة «الطرفية» داخل السطح لا تُنفّذ أوامر؛ نصوصها الآن تُعلن ذلك صراحةً.
- باقي بنود `docs/SWARM_PROPOSAL_EVALUATION.md` §4 (مثل ملف الاختبار الميت `gemini.service.test.ts`).
