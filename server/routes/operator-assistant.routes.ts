import type { Express, Request, Response } from 'express';
import type { AuditLog } from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { can } from '../security/permissions.js';
import {
  AssistantError,
  assistantAccountReady,
  assistantFieldsOnly,
  assistantObject,
  assistantStrictReady,
  assistantText,
  assistantUser,
  requireAssistantOrg,
  requireAssistantUser,
} from '../security/assistant-auth.js';
import {
  OperatorAssistantService,
  parseAssistantTurn,
} from '../services/operator-assistant.service.js';
import { AssistantAvatarService } from '../services/assistant-avatar.service.js';
import {
  assistantReportCsv,
  assistantScreens,
  createAssistantReport,
} from '../services/assistant-data.service.js';

interface Dependencies {
  brain?: OperatorAssistantService;
  avatar?: AssistantAvatarService;
  persistAudit?: (event: AuditLog) => Promise<void> | void;
}
export function registerOperatorAssistantRoutes(
  app: Express,
  dependencies: Dependencies = {}
): void {
  const brain = dependencies.brain || new OperatorAssistantService();
  const avatar = dependencies.avatar || new AssistantAvatarService();
  const limits = new Map<string, { count: number; until: number }>();
  const replies = new Map<string, { owner: string; text: string; expires: number }>();
  const rate = (key: string, max: number) => {
    const now = Date.now();
    for (const [id, limit] of limits) if (limit.until <= now) limits.delete(id);
    const limit = limits.get(key) || { count: 0, until: now + 60_000 };
    limit.count++;
    limits.set(key, limit);
    if (limit.count > max)
      throw new AssistantError(
        429,
        'ASSISTANT_RATE_LIMITED',
        'انتظر قليلاً قبل متابعة الطلبات.',
        Math.max(1, Math.ceil((limit.until - now) / 1000))
      );
  };
  const remember = (owner: string, id: string, text: string) => {
    for (const [key, reply] of replies) if (reply.expires <= Date.now()) replies.delete(key);
    while (replies.size >= 200) {
      const oldest = replies.keys().next().value;
      if (oldest === undefined) break;
      replies.delete(oldest);
    }
    replies.set(id, { owner, text, expires: Date.now() + 5 * 60_000 });
  };
  const handler =
    (
      kind: string,
      max: number,
      operation: (
        req: Request,
        res: Response,
        user: NonNullable<ReturnType<typeof assistantUser>>,
        org: string,
        owner: string
      ) => Promise<void> | void
    ) =>
    async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      let user: ReturnType<typeof assistantUser> = null;
      try {
        user = requireAssistantUser(req);
        res.locals.authenticatedUser = user;
        rate(`${user.id}:${kind}`, max);
        if (!brain.enabled && kind !== 'close')
          throw new AssistantError(503, 'ASSISTANT_DISABLED', 'المساعد معطل على الخادم.');
        const org = requireAssistantOrg(
          user,
          req.method === 'GET' ? req.query.organizationId : req.body?.organizationId
        );
        await operation(req, res, user, org, JSON.stringify([user.id, org]));
        if (!['signal', 'status'].includes(kind)) {
          const audit = erpStore.recordAudit(
            user.id,
            user.fullName,
            user.role,
            org,
            'OPERATOR_ASSISTANT_REQUEST',
            'OPERATOR_ASSISTANT',
            kind,
            `عملية ${kind}؛ لا يُحفظ صوت الإملاء أو نصه في سجل التدقيق.`
          );
          if (dependencies.persistAudit)
            void Promise.resolve(dependencies.persistAudit(audit)).catch(() => undefined);
        }
      } catch (error) {
        if (res.headersSent || res.destroyed) return;
        const safe =
          error instanceof AssistantError
            ? error
            : new AssistantError(
                500,
                'ASSISTANT_INTERNAL_ERROR',
                'تعذّر إتمام الطلب. لم نُرسل أمراً لحفظ بيانات ERP.'
              );
        if (safe.retryAfterSeconds) res.setHeader('Retry-After', safe.retryAfterSeconds);
        res.status(safe.status).json({
          error: safe.message,
          code: safe.code,
          ...(safe.retryAfterSeconds ? { retryAfterSeconds: safe.retryAfterSeconds } : {}),
        });
      }
    };
  app.get('/api/operator-assistant/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = assistantUser(req),
      strict = assistantStrictReady(),
      accountReady = assistantAccountReady(user);
    const problems: string[] = [];
    if (!brain.enabled) problems.push('اضبط AI_ASSISTANT_ENABLED=true بعد إعداد الخصوصية والأمان.');
    if (!strict)
      problems.push('الاتصال الفعلي يتطلب DEMO_MODE=false وأسرار JWT_SECRET وENCRYPTION_KEY قوية.');
    if (!user || !accountReady)
      problems.push('سجّل الدخول بحساب ERP نشط ذي كلمة مرور، وليس بمستخدم العرض.');
    if (!brain.configured)
      problems.push(
        'اضبط AI_ASSISTANT_GEMINI_API_KEY لاستخدام الإملاء والفهم الذكي. مفتاح Jules لا يصلح هنا.'
      );
    if (!avatar.configured)
      problems.push(
        'الفيديو الواقعي اختياري: يلزم DID_AVATAR_ENABLED وDID_API_KEY وDID_AGENT_ID لنوع V2/V3.'
      );
    res.json({
      enabled: brain.enabled,
      strictAuth: strict,
      authenticated: Boolean(user),
      accountReady,
      textReady: Boolean(brain.configured && strict && user && accountReady),
      avatarReady: Boolean(brain.enabled && avatar.configured && strict && user && accountReady),
      model: brain.model,
      problems,
      screens: user ? assistantScreens(user) : [],
    });
  });
  app.post(
    '/api/operator-assistant/turn',
    handler('turn', 12, async (req, res, user, _org, owner) => {
      const abort = new AbortController();
      const stop = () => {
        if (!res.writableEnded) abort.abort();
      };
      res.once('close', stop);
      try {
        const result = await brain.turn(user, parseAssistantTurn(req.body), abort.signal);
        if (abort.signal.aborted || res.destroyed) return;
        requireAssistantUser(req);
        requireAssistantOrg(user, req.body.organizationId);
        remember(owner, result.id, result.message);
        res.json(result);
      } finally {
        res.removeListener('close', stop);
      }
    })
  );
  app.post(
    '/api/operator-assistant/report',
    handler('report', 30, (req, res, user, org, owner) => {
      const body = assistantObject(req.body);
      assistantFieldsOnly(body, [
        'organizationId',
        'reportId',
        'startDate',
        'endDate',
        'keyword',
        'download',
      ]);
      const reportId = assistantText(body.reportId, 50);
      const report = createAssistantReport(user, org, reportId, {
        startDate: body.startDate as string,
        endDate: body.endDate as string,
        keyword: body.keyword as string,
      });
      if (body.download === true) {
        if (!can(user, 'print:all'))
          throw new AssistantError(403, 'ASSISTANT_FORBIDDEN', 'لا تملك صلاحية تصدير التقرير.');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Union_${reportId}.csv"`);
        res.send(assistantReportCsv(report));
      } else {
        remember(owner, report.id, report.summary);
        res.json(report);
      }
    })
  );
  app.post(
    '/api/operator-assistant/avatar',
    handler('avatar-create', 3, async (req, res, _user, _org, owner) => {
      const body = assistantObject(req.body);
      assistantFieldsOnly(body, ['organizationId', 'consent', 'requestId']);
      if (body.consent !== true)
        throw new AssistantError(
          400,
          'ASSISTANT_CONSENT_REQUIRED',
          'وافق على إرسال الرد النصي إلى مزوّد الفيديو وتكلفة الجلسة قبل تشغيلها.'
        );
      const id = assistantText(body.requestId, 80);
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(id))
        throw new AssistantError(400, 'ASSISTANT_INVALID_INPUT', 'معرّف عملية غير صحيح.');
      res.status(201).json(await avatar.create(owner, id));
    })
  );
  for (const kind of ['sdp', 'ice'] as const)
    app.post(
      `/api/operator-assistant/avatar/:id/${kind}`,
      handler('signal', 120, async (req, res, _user, _org, owner) => {
        const body = assistantObject(req.body);
        assistantFieldsOnly(
          body,
          kind === 'sdp'
            ? ['organizationId', 'answer']
            : ['organizationId', 'candidate', 'sdpMid', 'sdpMLineIndex']
        );
        await avatar.signal(owner, String(req.params.id), kind, body);
        res.json({ success: true });
      })
    );
  app.post(
    '/api/operator-assistant/avatar/:id/speak',
    handler('avatar-speak', 12, async (req, res, _user, _org, owner) => {
      const body = assistantObject(req.body);
      assistantFieldsOnly(body, ['organizationId', 'replyId']);
      const replyId = assistantText(body.replyId, 100),
        reply = replies.get(replyId);
      if (!reply || reply.owner !== owner || reply.expires <= Date.now())
        throw new AssistantError(
          404,
          'ASSISTANT_REPLY_EXPIRED',
          'انتهت صلاحية الرد الصوتي أو لا تملك الوصول إليه.'
        );
      await avatar.speak(owner, String(req.params.id), replyId, reply.text);
      res.json({ success: true });
    })
  );
  app.delete(
    '/api/operator-assistant/avatar',
    handler('close', 60, async (req, res, _user, _org, owner) => {
      const requestId = assistantText(req.body.requestId, 80);
      await avatar.closeOwner(owner, requestId);
      res.json({ success: true });
    })
  );
  app.delete(
    '/api/operator-assistant/avatar/:id',
    handler('close', 60, async (req, res, _user, _org, owner) => {
      await avatar.close(owner, String(req.params.id));
      res.json({ success: true });
    })
  );
  app.post(
    '/api/operator-assistant/forget',
    handler('close', 60, async (_req, res, _user, _org, owner) => {
      for (const [key, reply] of replies) if (reply.owner === owner) replies.delete(key);
      await avatar.closeOwner(owner);
      res.json({ success: true });
    })
  );
}
