/**
 * ===== مسارات سرب أدوات ERP =====
 * المرجع: `docs/SWARM_ERP_TOOLS.md` (القرار «ب» في `docs/SWARM_PROPOSAL_EVALUATION.md`).
 *
 *   GET  /api/swarm/tools              — سجل الأدوات الحقيقية (بيانات وصفية، بلا تنفيذ)
 *   POST /api/swarm/tasks              — خطة مهمة من طلب طبيعي (اختيار حتمي للأدوات + إنشاء TaskState)
 *   GET  /api/swarm/tasks              — مهام هذه المنظمة (أحدث أولاً)
 *   GET  /api/swarm/tasks/:id          — حالة المهمة الكاملة (الخطة/الأدلة/الفشل/التحقق)
 *   POST /api/swarm/tasks/:id/run      — تنفيذ الخطوة الجارية بأداة حقيقية
 *   POST /api/swarm/tasks/:id/run-all  — تنفيذ المهمة كاملة بحد أقصى معلن للخطوات
 *
 * كل مسار يمر عبر `requirePermission` نفسه المستخدم في بقية المشروع، ويُسجَّل في سجل التدقيق
 * المتسلسل. لا يوجد أي "نجاح" مصطنع: المهمة تُعلن VERIFIED فقط بتحقق مستقل وأدلة فعلية.
 */
import type { Express, Request, Response } from 'express';
import type { User } from '../../src/types/erp.js';
import {
  auditSwarmTask,
  createSwarmTask,
  getSwarmTask,
  getSwarmTool,
  listSwarmTasks,
  listSwarmTools,
  runSwarmStep,
} from '../services/swarm/task-state.service.js';

interface SwarmToolsDeps {
  requirePermission: (req: Request, res: Response, permission: string) => User | null;
  /** الصلاحيات الفعلية للمستخدم (من RBAC) — تُستخدم لاختيار ما يمكنه تنفيذه */
  permissionsOf: (user: User) => string[];
}

const MAX_RUN_ALL_STEPS = 6; // حد أقصى معلن لتنفيذ المهمة كاملة في طلب واحد

export function registerSwarmToolsRoutes(app: Express, deps: SwarmToolsDeps): void {
  app.get('/api/swarm/tools', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    const permissions = deps.permissionsOf(user);
    res.json({
      tools: listSwarmTools().map((tool) => ({
        ...tool,
        available: permissions.includes(tool.permission) || permissions.includes('*'),
      })),
      note: 'كل الأدوات للقراءة فقط وتعمل على بيانات المتجر الحقيقية — لا وكلاء يتحكمون بنظام التشغيل أو بمتصفح.',
    });
  });

  app.post('/api/swarm/tasks', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    const { request: userRequest, context } = req.body || {};
    if (!userRequest || typeof userRequest !== 'string' || !userRequest.trim())
      return res.status(400).json({ error: 'اكتب الطلب أولاً.' });

    const task = createSwarmTask({
      userRequest: userRequest.trim(),
      organizationId: String(req.body?.organizationId || user.organizationId || 'org-general'),
      requestedBy: user.id,
      requestedByName: user.fullName,
      context: context && typeof context === 'object' ? context : undefined,
      allowedPermissions: deps.permissionsOf(user),
      maxSteps: 3,
    });

    const blocked = task.blockedByPermission.length > 0;
    auditSwarmTask(
      task,
      'SWARM_TASK_PLANNED',
      `خطة سرب الأدوات: ${task.plan.map((step) => step.toolId).join(' ← ') || 'بلا أدوات مطابقة'} (النية ${task.intent})`,
      blocked ? 'BLOCKED' : 'SUCCESS'
    );
    res.status(201).json({ task });
  });

  app.get('/api/swarm/tasks', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    res.json({ tasks: listSwarmTasks(user.organizationId) });
  });

  app.get('/api/swarm/tasks/:id', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    const task = getSwarmTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    res.json({ task });
  });

  app.post('/api/swarm/tasks/:id/run', async (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    const task = getSwarmTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });

    try {
      const outcome = await runSwarmStep(
        task.id,
        getSwarmTool,
        deps.permissionsOf(user),
        (req.body?.input && typeof req.body.input === 'object' ? req.body.input : {}) as Record<string, unknown>,
        typeof req.body?.stepId === 'string' ? req.body.stepId : undefined
      );
      auditSwarmTask(
        outcome.task,
        'SWARM_STEP_EXECUTED',
        `تنفيذ «${outcome.step.title}»: ${outcome.message}`,
        outcome.task.status === 'BLOCKED' ? 'BLOCKED' : outcome.step.status === 'FAILED' ? 'FAILURE' : 'SUCCESS'
      );
      res.json({ task: outcome.task, step: outcome.step, message: outcome.message });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'تعذّر تنفيذ الخطوة' });
    }
  });

  app.post('/api/swarm/tasks/:id/run-all', async (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'view:all');
    if (!user) return;
    let task = getSwarmTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });

    const messages: string[] = [];
    for (let index = 0; index < MAX_RUN_ALL_STEPS; index += 1) {
      const pending = task.plan.find((step) => step.status === 'PENDING');
      if (!pending) break;
      try {
        const outcome = await runSwarmStep(
          task.id,
          getSwarmTool,
          deps.permissionsOf(user),
          (req.body?.input && typeof req.body.input === 'object' ? req.body.input : {}) as Record<string, unknown>,
          pending.id
        );
        task = outcome.task;
        messages.push(`${outcome.step.title}: ${outcome.message}`);
        // التدقيق لكل خطوة في المسار الجماعي أيضاً — لا خطوة تنفيذ بلا أثر
        auditSwarmTask(
          task,
          'SWARM_STEP_EXECUTED',
          `تنفيذ «${outcome.step.title}»: ${outcome.message}`,
          outcome.step.status === 'FAILED' ? 'FAILURE' : 'SUCCESS'
        );
        if (task.status === 'BLOCKED' || task.status === 'FAILED') break;
      } catch (error: any) {
        messages.push(`توقف التنفيذ: ${error?.message || 'خطأ غير معروف'}`);
        break;
      }
    }

    if (task.plan.every((step) => step.status !== 'PENDING') && task.status !== 'BLOCKED') {
      // إنهاء صريح: حالة نهائية مع سببها (VERIFIED أو FAILED) — لا «نجاح معلّق»
      if (task.verification.status === 'PENDING') {
        task.status = 'FAILED';
        task.verification = {
          status: 'FAILED',
          checkedBy: task.verification.checkedBy,
          detail: 'انتهت الخطوات بلا تحقق مستقل كافٍ',
        };
      }
    }

    auditSwarmTask(
      task,
      'SWARM_TASK_COMPLETED',
      `تنفيذ المهمة — الحالة ${task.status}: ${messages.join(' | ') || 'لا خطوات'}`,
      task.status === 'VERIFIED' ? 'SUCCESS' : task.status === 'BLOCKED' ? 'BLOCKED' : 'FAILURE'
    );
    res.json({ task, messages });
  });
}
