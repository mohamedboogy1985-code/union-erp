import type { Express, Request, Response } from 'express';
import type { AuditLog, User } from '../../src/types/erp.js';
import { JULES_LIMITS } from '../../src/types/jules.js';
import { erpStore } from '../db/store.js';
import { advancedAuthService } from '../services/auth-advanced.service.js';
import { BCRYPT_HASH_PATTERN } from '../security/admin-credentials.js';
import { can } from '../security/permissions.js';
import {
  JulesError,
  JulesMutationCache,
  JulesService,
  inputObject,
  inputText,
  julesService,
  pageToken,
  parseCreateInput,
  requestId,
} from '../services/jules.service.js';

interface Dependencies {
  requirePermission: (req: Request, res: Response, permission: string) => User | null;
  service?: JulesService;
  persistAudit?: (event: AuditLog) => Promise<void> | void;
}

/** Unlike the ERP demo switcher, this identity can ONLY come from a signed JWT. */
function tokenUser(req: Request): User | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const result = advancedAuthService.verifyToken(header.slice(7));
  if (
    !result.valid ||
    typeof result.payload?.sub !== 'string' ||
    result.payload.authMode !== 'password'
  )
    return null;
  return erpStore.users.find((user) => user.id === result.payload.sub) || null;
}

export function registerJulesRoutes(app: Express, dependencies: Dependencies): void {
  const service = dependencies.service || julesService;
  const mutations = new JulesMutationCache();
  const limits = new Map<string, { count: number; expires: number }>();

  app.use('/api/jules', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const audit = (
    user: User | null,
    action: string,
    entityId: string,
    status: 'SUCCESS' | 'FAILURE' | 'BLOCKED' = 'SUCCESS'
  ) => {
    const event = erpStore.recordAudit(
      user?.id || 'anonymous',
      user?.fullName || 'غير موثّق',
      user?.role || 'ANONYMOUS',
      user?.organizationId || 'org-general',
      action,
      'JULES',
      entityId,
      // Deliberately no prompts, plan contents, messages, response bodies or credentials.
      `${action} — ${status}`,
      undefined,
      undefined,
      status
    );
    if (dependencies.persistAudit) {
      // A database failure must not turn an accepted Google task into a retryable failure.
      void Promise.resolve()
        .then(() => dependencies.persistAudit?.(event))
        .catch(() => {
          console.warn('[Jules] تعذّر حفظ حدث التدقيق؛ لا تعِد إرسال المهمة بسبب تعذّر التسجيل.');
        });
    }
  };

  const checkAdmin = (user: User | null): User => {
    if (!user)
      throw new JulesError(
        401,
        'AUTH_REQUIRED',
        'سجّل دخول المدير بكلمة المرور للوصول إلى Jules. اختيار مستخدم العرض وحده لا يكفي.'
      );
    if (!user.isActive || user.isDemo || !can(user, 'system:admin')) {
      throw new JulesError(403, 'JULES_FORBIDDEN', 'لوحة Jules متاحة للمدير الفعلي النشط فقط.');
    }
    return user;
  };

  const rateLimit = (req: Request, user: User) => {
    const now = Date.now();
    for (const [key, bucket] of limits) if (bucket.expires <= now) limits.delete(key);
    const writing = req.method !== 'GET';
    const key = `${user.id}:${writing ? 'write' : 'read'}`;
    const bucket = limits.get(key) || { count: 0, expires: now + 60_000 };
    bucket.count += 1;
    limits.set(key, bucket);
    if (bucket.count > (writing ? 20 : 90)) {
      throw new JulesError(
        429,
        'JULES_LOCAL_RATE_LIMIT',
        'طلبات كثيرة لهذه اللوحة. انتظر قبل المحاولة مجدداً.',
        Math.ceil((bucket.expires - now) / 1000)
      );
    }
  };

  const handle =
    (
      handler: (req: Request, res: Response, user: User) => Promise<void> | void,
      statusOnly = false
    ) =>
    async (req: Request, res: Response): Promise<void> => {
      let user: User | null = tokenUser(req);
      try {
        // The disabled setup screen may be viewed by a demo administrator; NEVER upstream data.
        if (!user && statusOnly && !service.getStatus().strictAuth && !req.headers.authorization) {
          user = dependencies.requirePermission(req, res, 'system:admin');
          if (!user) return;
        }
        user = checkAdmin(user);
        res.locals.authenticatedUser = user;
        rateLimit(req, user);
        if (!statusOnly) {
          service.assertReady();
          if (!BCRYPT_HASH_PATTERN.test(user.passwordHash || '')) {
            throw new JulesError(
              403,
              'JULES_ACCOUNT_NOT_READY',
              'يلزم ضبط كلمة مرور قوية للمدير على الخادم قبل تشغيل Jules.'
            );
          }
        }
        await handler(req, res, user);
      } catch (error) {
        const known =
          error instanceof JulesError
            ? error
            : new JulesError(
                500,
                'JULES_INTERNAL_ERROR',
                'تعذّر معالجة طلب Jules. راجع الحالة قبل إعادة إرسال العملية.',
                undefined,
                req.method !== 'GET'
              );
        if (known.retryAfterSeconds) res.setHeader('Retry-After', String(known.retryAfterSeconds));
        if (req.method !== 'GET' || known.status === 401 || known.status === 403) {
          audit(
            user,
            known.status === 401 || known.status === 403
              ? 'JULES_ACCESS_BLOCKED'
              : 'JULES_REQUEST_FAILED',
            'request',
            known.status === 401 || known.status === 403 ? 'BLOCKED' : 'FAILURE'
          );
        }
        res.status(known.status).json({
          error: known.message,
          code: known.code,
          retryAfterSeconds: known.retryAfterSeconds,
          outcomeUnknown: known.outcomeUnknown,
        });
      }
    };

  app.get(
    '/api/jules/status',
    handle((req, res, user) => {
      const status = service.getStatus();
      const authenticated = Boolean(tokenUser(req));
      const accountReady = BCRYPT_HASH_PATTERN.test(user.passwordHash || '');
      const problems = [...status.problems];
      if (!accountReady)
        problems.push(
          'اضبط ERP_ADMIN_PASSWORD_HASH للمدير على الخادم؛ لا توجد كلمة مرور افتراضية.'
        );
      if (!authenticated)
        problems.push('سجّل الدخول بكلمة مرور المدير قبل أي اتصال فعلي بـ Jules.');
      res.json({
        ...status,
        authenticated,
        accountReady,
        ready: status.ready && authenticated && accountReady,
        problems,
      });
    }, true)
  );

  app.get(
    '/api/jules/sources',
    handle(async (req, res) => {
      res.json(await service.listSources(pageToken(req.query.pageToken)));
    })
  );
  app.get(
    '/api/jules/sessions',
    handle(async (req, res) => {
      res.json(await service.listSessions(pageToken(req.query.pageToken)));
    })
  );
  app.get(
    '/api/jules/sessions/:id',
    handle(async (req, res) => {
      res.json(await service.getSession(req.params.id));
    })
  );
  app.get(
    '/api/jules/sessions/:id/activities',
    handle(async (req, res) => {
      res.json(await service.listActivities(req.params.id, pageToken(req.query.pageToken)));
    })
  );

  app.post(
    '/api/jules/sessions',
    handle(async (req, res, user) => {
      const input = parseCreateInput(req.body);
      const session = await mutations.run(
        `${user.id}:create:${input.requestId}`,
        input,
        async () => {
          const result = await service.createSession(input);
          audit(user, 'JULES_SESSION_CREATED', result.id);
          return result;
        }
      );
      res.status(201).json(session);
    })
  );

  app.post(
    '/api/jules/sessions/:id/approve-plan',
    handle(async (req, res, user) => {
      const input = inputObject(req.body, ['planId', 'confirmed', 'requestId']);
      if (input.confirmed !== true)
        throw new JulesError(
          400,
          'JULES_CONFIRMATION_REQUIRED',
          'يجب تأكيد مراجعة الخطة قبل بدء تنفيذها.'
        );
      const planId = inputText(input.planId, 'معرّف الخطة', 200);
      const nonce = requestId(input.requestId);
      await mutations.run(`${user.id}:approve:${req.params.id}:${nonce}`, { planId }, async () => {
        await service.approvePlan(req.params.id, planId);
        audit(user, 'JULES_PLAN_APPROVED', req.params.id);
      });
      res.json({ success: true });
    })
  );

  app.post(
    '/api/jules/sessions/:id/messages',
    handle(async (req, res, user) => {
      const input = inputObject(req.body, ['prompt', 'requestId']);
      const prompt = inputText(input.prompt, 'الرسالة', JULES_LIMITS.message);
      const nonce = requestId(input.requestId);
      await mutations.run(`${user.id}:message:${req.params.id}:${nonce}`, { prompt }, async () => {
        await service.sendMessage(req.params.id, prompt);
        audit(user, 'JULES_MESSAGE_SENT', req.params.id);
      });
      res.json({ success: true });
    })
  );
}
