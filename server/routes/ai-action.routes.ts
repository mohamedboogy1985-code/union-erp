import { Request, Response } from 'express';
import { aiActionsService } from '../services/ai-actions.service.js';
import { can } from '../security/permissions.js';

/**
 * ===== مسارات تنفيذ أوامر الذكاء الاصطناعي (AI Command Execution) =====
 * تسمح للمساعد الذكي بتنفيذ عمليات حقيقية على النظام من أي شاشة، مع:
 *  - تحقق RBAC صارم عبر requirePermission قبل أي تنفيذ كتابة.
 *  - عمليات القراءة/التقارير تُنفَّذ فوراً (آمنة).
 *  - عمليات الكتابة تُحوَّل إلى "مسودة تأكيد" يعرضها المساعد ثم يؤكدها المستخدم.
 */

export interface AIActionRoutesDeps {
  requirePermission: (req: Request, res: Response, permission: string) => any;
}

export function registerAIActionRoutes(app: any, deps: AIActionRoutesDeps): void {
  const { requirePermission } = deps;

  // قائمة الإجراءات المتاحة (يُفلتر بحسب صلاحيات المستخدم)
  app.get('/api/ai/actions', (req: Request, res: Response) => {
    const user = req.headers['x-user-id'] ? requirePermission(req, res, 'view:all') || null : null;
    const all = aiActionsService.listActions();
    const result = all.map((a) => ({ ...a, allowed: user ? can(user, a.permission) : false }));
    res.json(result);
  });

  // معاينة أمر: يحوّل طلب تنفيذ إلى مسودة تأكيد (يتحقق من الصلاحية)
  app.post('/api/ai/actions/preview', (req: Request, res: Response) => {
    const { actionId, args, organizationId } = req.body || {};
    if (!actionId) return res.status(400).json({ error: 'معرّف الإجراء مطلوب.' });
    const user = requirePermission(req, res, 'view:all');
    if (!user) return;
    const outcome = aiActionsService.handle(user, organizationId, String(actionId), args);
    if (outcome.status === 'needs_confirmation') {
      return res.json(outcome);
    }
    // عمليات قراءة/أخطاء/رفض صلاحيات تُعاد مباشرة
    return res.json(outcome);
  });

  // تنفيذ أمر مؤكد بعد موافقة المستخدم - كتابة حقيقية مع سجل تدقيق
  app.post('/api/ai/actions/confirm', (req: Request, res: Response) => {
    const { actionId, payload, organizationId } = req.body || {};
    if (!actionId) return res.status(400).json({ error: 'معرّف الإجراء مطلوب.' });
    const user = requirePermission(req, res, 'view:all');
    if (!user) return;
    try {
      const outcome = aiActionsService.confirm(user, organizationId, String(actionId), payload);
      res.json(outcome);
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'تعذر تنفيذ الأمر.' });
    }
  });
}
