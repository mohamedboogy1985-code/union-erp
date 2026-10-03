import { Router } from "express";
import type { Request, Response } from "express";
import {
  generalAssistantService,
  type AssistantRunInput,
} from "../services/general-assistant.service.js";
import {
  INTENT_FUNCTIONS,
  intentToCommand,
  intentToJson,
  intentToJsonFull,
  parseIntent,
  type ParsedIntent,
} from "../services/intent-parser.service.js";
import { TONE_RULES } from "../services/tone.service.js";
import { can } from "../security/permissions.js";
import type { User } from "../../src/types/erp.js";

interface AssistantRouterDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
}

const intentLog: Array<{
  at: string;
  action: string;
  function: string;
  execution: string;
  confidence: number;
  parameterKeys: string[];
  sourceLength: number;
  userId: string;
}> = [];

const logIntent = (intent: ParsedIntent, userId: string): void => {
  intentLog.unshift({
    at: new Date().toISOString(),
    action: intent.action,
    function: intent.function,
    execution: intent.execution,
    confidence: intent.confidence,
    parameterKeys: Object.keys(intent.parameters).slice(0, 30),
    sourceLength: intent.sourceText.length,
    userId,
  });
  if (intentLog.length > 200) intentLog.length = 200;
};

/** مسارات المساعد العام: يفهم الطلب وينفّذه على بيانات البرنامج، والتأكيد للعمليات المالية. */
export const createGeneralAssistantRouter = (
  deps: AssistantRouterDeps,
): Router => {
  const router = Router();

  const actor = (req: Request, res: Response): User | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: "مطلوب تسجيل دخول صالح." });
      return null;
    }
    return user;
  };

  router.get("/status", (req: Request, res: Response) => {
    if (!actor(req, res)) return;
    res.json({
      nameAr: "المساعد العام",
      engineAr: "محرّك تنفيذ محلي داخل البرنامج — بلا خدمات خارجية",
      capabilitiesAr: [
        "تنفيذ الأوامر على بيانات البرنامج الحقيقية",
        "إنشاء فاتورة إلكترونية وإرسالها لمنظومة الضرائب",
        "اعتماد سلف العاملين وترحيل مسير المرتبات",
        "بصمة اليد والوجه وحالة ربطها بالمراتب",
        "استخراج البيانات كملفات CSV وبحث بالاسم والبيان وأرقام الشيكات والتواريخ",
        "تسجيل قيد من كلام عامي ثم اعتماده وترحيله",
        "حسابات الضرائب والخصم والإضافة والقيمة المضافة",
        "كشوف الحسابات والإجماليات والتقارير السريعة",
        "فتح أي شاشة والتنقل",
      ],
      screenCount: 31,
      version: "GA-2.0",
    });
  });

  router.post("/run", async (req: Request, res: Response) => {
    const user = actor(req, res);
    if (!user) return;
    const body = req.body ?? {};
    const text = String(body.text ?? "").trim().slice(0, 6000);
    if (!text) {
      res.status(400).json({ error: "اكتب الطلب أولاً." });
      return;
    }
    const organizationId = String(body.organizationId ?? user.organizationId ?? "org-general").slice(0, 80);
    if (organizationId !== user.organizationId && !user.allowedOrgIds.includes(organizationId) && !can(user, 'system:admin')) {
      res.status(403).json({ error: "غير مصرح باستخدام بيانات هذه الجهة." });
      return;
    }
    const input: AssistantRunInput = {
      text,
      heldText: text,
      organizationId,
      screenId: body.screenId ? String(body.screenId).slice(0, 80) : undefined,
      user,
    };
    try {
      const intent = parseIntent(text);
      logIntent(intent, user.id);
      const result = await generalAssistantService.run(input);
      deps.auditWrite?.({
        action: "ASSISTANT_RUN",
        intentAction: intent.action,
        intentFunction: intent.function,
        textLength: text.length,
        navigateTo: result.navigateTo,
        needsConfirm: result.needsConfirm,
        userId: user.id,
      });
      res.json({
        ...result,
        intent,
        intentJson: intentToJson(intent),
        intentJsonFull: intentToJsonFull(intent),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "تعذّر تنفيذ الطلب." });
    }
  });

  router.get("/intents/schema", (req: Request, res: Response) => {
    const user = actor(req, res);
    if (!user) return;
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'يلزم امتلاك صلاحية الاطلاع على مخطط المساعد.' });
      return;
    }
    res.json({
      schemaVersion: "intent-v1",
      actionsAr: "تحويل الكلام إلى JSON ثم تنفيذ الدالة المرتبطة",
      contract: {
        action:
          "CREATE_INVOICE | GET_PAYROLL | CREATE_JOURNAL | GET_ACCOUNT | QUERY_ENTITY | EXTRACT_DATA | SEARCH_DATA | OPEN_SCREEN | HELP",
        parameters: "معاملات الأمر (العميل/المبلغ/الشهر/الحساب/الاسم...)",
        function: "اسم الدالة المنفَّذة",
        execution: "direct تنفيذ فوري • draft يستوقف على اعتمادك",
      },
      functions: Object.entries(INTENT_FUNCTIONS).map(([action, spec]) => ({
        action,
        function: spec.fn,
        execution: spec.execution,
        descriptionAr: spec.descriptionAr,
      })),
      toneRules: TONE_RULES,
    });
  });

  router.get("/intents", (req: Request, res: Response) => {
    const user = actor(req, res);
    if (!user) return;
    if (!can(user, 'audit:read')) {
      res.status(403).json({ error: 'تحتاج صلاحية قراءة سجل الأوامر.' });
      return;
    }
    res.json({ count: intentLog.length, rows: intentLog.slice(0, 50) });
  });

  router.post("/intent", async (req: Request, res: Response) => {
    const user = actor(req, res);
    if (!user) return;
    const body = req.body ?? {};
    const text = String(body.text ?? "").trim();
    const provided = body.intent && typeof body.intent === "object" ? body.intent : null;
    const sourceText = text || (provided && typeof provided.source_text === 'string' ? String(provided.source_text).trim().slice(0, 6000) : '');
    if (!sourceText) {
      res.status(400).json({ error: "ابعت نصاً لتحويله إلى نية تنفيذ." });
      return;
    }
    // يعاد بناء JSON على الخادم من النص؛ لا تُنفّذ action أو parameters يرسلها العميل مباشرة.
    const organizationId = String(body.organizationId ?? user.organizationId ?? "org-general").slice(0, 80);
    if (organizationId !== user.organizationId && !user.allowedOrgIds.includes(organizationId) && !can(user, 'system:admin')) {
      res.status(403).json({ error: "غير مصرح باستخدام بيانات هذه الجهة." });
      return;
    }
    const intent: ParsedIntent = parseIntent(sourceText);
    logIntent(intent, user.id);
    if (body.execute === false) {
      res.json({
        intent,
        intentJson: intentToJson(intent),
        intentJsonFull: intentToJsonFull(intent),
        executed: false,
      });
      return;
    }
    if (intent.action === "UNKNOWN") {
      res.json({
        intent,
        intentJson: intentToJson(intent),
        intentJsonFull: intentToJsonFull(intent),
        executed: false,
        errorAr: "الطلب غير واضح — اكتبه بصيغة أوضح أو اكتب «مساعدة».",
      });
      return;
    }
    const runText = (intentToCommand(intent) ?? intent.sourceText) || text;
    try {
      const result = await generalAssistantService.run({
        text: runText,
        heldText: runText,
        organizationId,
        screenId: body.screenId ? String(body.screenId).slice(0, 80) : undefined,
        user,
      });
      deps.auditWrite?.({
        action: "ASSISTANT_INTENT",
        intentAction: intent.action,
        intentFunction: intent.function,
        textLength: runText.length,
        userId: user.id,
      });
      res.json({
        intent,
        intentJson: intentToJson(intent),
        intentJsonFull: intentToJsonFull(intent),
        executed: true,
        result,
      });
    } catch (err: any) {
      res.status(400).json({
        intent,
        intentJson: intentToJson(intent),
        intentJsonFull: intentToJsonFull(intent),
        executed: false,
        error: err.message || "تعذّر تنفيذ الدالة.",
      });
    }
  });

  router.post("/confirm", (req: Request, res: Response) => {
    const user = actor(req, res);
    if (!user) return;
    if (!can(user, "journal:create")) {
      res.status(403).json({
        error: "مش مسموح لك بتسجيل القيود — كلّم المسؤول عن الصلاحيات.",
      });
      return;
    }
    const actionId = String(req.body?.actionId ?? "");
    if (!actionId) {
      res.status(400).json({ error: "معرّف الإجراء مطلوب." });
      return;
    }
    try {
      const result = generalAssistantService.confirm(actionId, user);
      deps.auditWrite?.({
        action: "ASSISTANT_CONFIRM",
        actionId,
        userId: user.id,
        resultStepCount: result.steps.length,
        hasPayload: Boolean(result.payload),
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "تعذّر تنفيذ الإجراء." });
    }
  });

  return router;
};
