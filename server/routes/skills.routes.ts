import { Request, Response } from 'express';
import { erpStore } from '../db/store.js';
import type {
  AccountingProcedure,
  AiAgentSkill,
  EmployeeSkill,
  Skill,
  SkillCategory,
  SkillLevel,
  TrainingEnrollment,
  TrainingProgram,
} from '../../src/types/erp.js';
import { SKILL_CATEGORY_AR } from '../../src/types/erp.js';

/**
 * ===== نظام المهارات الموحد (Skills Unified System) =====
 * استُعيد من PR #24/#26 — التفاصيل في docs/CLOSED_PR_REVIEW.md.
 *
 * يغطي أربع فئات في مسار واحد: HR، التدريب، مهارات المساعد الذكي، والإجراءات
 * المحاسبية؛ متاح في كل البوابات (portal: ALL).
 *
 * المسارات:
 *  - GET    /api/skills                          قائمة المهارات (فلترة: category/search/isActive)
 *  - GET    /api/skills/summary                  ملخص إحصائي + المهارات الأقرب للانتهاء
 *  - POST   /api/skills                          إنشاء مهارة            (hr:manage)
 *  - PUT    /api/skills/:id                      تعديل مهارة            (hr:manage)
 *  - DELETE /api/skills/:id                      حذف مهارة              (hr:manage)
 *  - GET    /api/employee-skills                 مهارات الموظفين
 *  - POST   /api/employee-skills                 ربط مهارة بموظف        (hr:manage)
 *  - DELETE /api/employee-skills/:id             حذف ربط مهارة          (hr:manage)
 *  - GET    /api/training-programs               البرامج التدريبية
 *  - POST   /api/training-programs               إنشاء برنامج           (hr:manage)
 *  - GET    /api/training-enrollments            التسجيلات
 *  - POST   /api/training-enrollments            تسجيل موظف             (hr:manage)
 *  - PUT    /api/training-enrollments/:id/progress  تحديث التقدم        (hr:manage)
 *  - GET    /api/ai-agent-skills                 مهارات الوكلاء
 *  - PUT    /api/ai-agent-skills/:id/toggle      تفعيل/تعطيل مهارة ذكية  (system:admin)
 *  - GET    /api/accounting-procedures           الإجراءات المحاسبية
 *  - POST   /api/accounting-procedures/:id/execute  تنفيذ إجراء مسجَّل   (journal:create)
 */

interface SkillsRouteDeps {
  requirePermission: (req: Request, res: Response, permission: string) => any;
}

const CATEGORIES: SkillCategory[] = ['HR', 'TRAINING', 'AI_AGENT', 'ACCOUNTING'];
const LEVELS: SkillLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
const ENROLLMENT_STATUSES: TrainingEnrollment['status'][] = [
  'ENROLLED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'DROPPED',
];

/** فلترة نصية آمنة (تتجاهل المدخل غير النصي بدل أن ترمي) */
function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isCategory(value: unknown): value is SkillCategory {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value);
}

function isLevel(value: unknown): value is SkillLevel {
  return typeof value === 'string' && (LEVELS as string[]).includes(value);
}

/** نسبة مئوية محدودة بين 0 و100 */
function boundedPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function nextCode(prefix: string, items: { code: string }[], pad = 3): string {
  const highest = items.reduce((max, item) => {
    const match = /(\d+)$/.exec(item.code || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(pad, '0')}`;
}

export function registerSkillsRoutes(app: any, { requirePermission }: SkillsRouteDeps): void {
  // ==========================================
  // المهارات — Skills Catalog
  // ==========================================
  app.get('/api/skills', (req: Request, res: Response) => {
    const category = queryString(req.query.category);
    const search = queryString(req.query.search);
    const isActive = queryString(req.query.isActive);
    let list: Skill[] = erpStore.skills;

    if (category) {
      if (!isCategory(category))
        return res.status(400).json({ error: `فئة مهارة غير معروفة: ${category}` });
      list = list.filter((s) => s.category === category);
    }
    if (isActive !== undefined) {
      const wanted = isActive === 'true';
      list = list.filter((s) => s.isActive === wanted);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.nameEn || '').toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }
    res.json(list);
  });

  app.get('/api/skills/summary', (_req: Request, res: Response) => {
    const byCategory: Record<SkillCategory, number> = {
      HR: 0,
      TRAINING: 0,
      AI_AGENT: 0,
      ACCOUNTING: 0,
    };
    for (const skill of erpStore.skills) byCategory[skill.category] = (byCategory[skill.category] || 0) + 1;

    const usageBySkill: Record<string, number> = {};
    for (const item of erpStore.employeeSkills)
      usageBySkill[item.skillId] = (usageBySkill[item.skillId] || 0) + 1;
    const topSkills = Object.entries(usageBySkill)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skillId, count]) => ({
        skillId,
        skillName: erpStore.skills.find((s) => s.id === skillId)?.name || skillId,
        count,
      }));

    const now = Date.now();
    const expiringSoon = erpStore.employeeSkills
      .filter((item) => {
        if (!item.expiryDate) return false;
        const days = (new Date(item.expiryDate).getTime() - now) / 86_400_000;
        return days >= 0 && days <= 30;
      })
      .slice(0, 10);

    res.json({
      totalSkills: erpStore.skills.length,
      byCategory,
      totalEmployeeSkills: erpStore.employeeSkills.length,
      totalTrainingPrograms: erpStore.trainingPrograms.length,
      totalEnrollments: erpStore.trainingEnrollments.length,
      totalAiSkills: erpStore.aiAgentSkills.length,
      totalProcedures: erpStore.accountingProcedures.length,
      topSkills,
      expiringSoon,
    });
  });

  app.post('/api/skills', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const { name, description, category, level, icon, color, estimatedHours, nameEn } = req.body || {};
    if (!name || !category) return res.status(400).json({ error: 'اسم المهارة وفئتها مطلوبان.' });
    if (!isCategory(category)) return res.status(400).json({ error: `فئة مهارة غير معروفة: ${category}` });
    if (level !== undefined && !isLevel(level))
      return res.status(400).json({ error: `مستوى مهارة غير معروف: ${level}` });

    const now = new Date().toISOString();
    const skill: Skill = {
      id: `skl-${Date.now()}`,
      code: nextCode('SKL', erpStore.skills),
      name: String(name),
      ...(nameEn ? { nameEn: String(nameEn) } : {}),
      description: String(description || ''),
      category,
      level: isLevel(level) ? level : 'INTERMEDIATE',
      icon: icon || 'Award',
      color: color || 'text-indigo-400',
      isActive: true,
      estimatedHours: Number(estimatedHours) || 0,
      organizationId: user.organizationId,
      createdAt: now,
      updatedAt: now,
    };
    erpStore.skills.unshift(skill);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'SKILL_CREATED',
      'SKILL',
      skill.id,
      `إنشاء مهارة جديدة [${skill.name}] فئة ${SKILL_CATEGORY_AR[skill.category]}`
    );
    res.status(201).json(skill);
  });

  app.put('/api/skills/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const skill = erpStore.skills.find((s) => s.id === req.params.id);
    if (!skill) return res.status(404).json({ error: 'المهارة غير موجودة.' });
    const { name, description, category, level, icon, color, estimatedHours, isActive } = req.body || {};
    if (category !== undefined && !isCategory(category))
      return res.status(400).json({ error: `فئة مهارة غير معروفة: ${category}` });
    if (level !== undefined && !isLevel(level))
      return res.status(400).json({ error: `مستوى مهارة غير معروف: ${level}` });

    const before = { name: skill.name, category: skill.category, level: skill.level, isActive: skill.isActive };
    if (name !== undefined) skill.name = String(name);
    if (description !== undefined) skill.description = String(description);
    if (category !== undefined) skill.category = category;
    if (level !== undefined) skill.level = level;
    if (icon !== undefined) skill.icon = String(icon);
    if (color !== undefined) skill.color = String(color);
    if (estimatedHours !== undefined) skill.estimatedHours = Number(estimatedHours) || 0;
    if (isActive !== undefined) skill.isActive = isActive === true || isActive === 'true';
    skill.updatedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'SKILL_UPDATED',
      'SKILL',
      skill.id,
      `تعديل المهارة [${skill.name}]`,
      before,
      { name: skill.name, category: skill.category, level: skill.level, isActive: skill.isActive }
    );
    res.json(skill);
  });

  app.delete('/api/skills/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const index = erpStore.skills.findIndex((s) => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المهارة غير موجودة.' });
    const [removed] = erpStore.skills.splice(index, 1);
    // منع بقايا مرتبطة بمهارة محذوفة (سلامة المراجع داخل المتجر)
    erpStore.employeeSkills = erpStore.employeeSkills.filter((item) => item.skillId !== removed.id);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'SKILL_DELETED',
      'SKILL',
      removed.id,
      `حذف المهارة [${removed.name}]`
    );
    res.json({ success: true, deleted: removed.id });
  });

  // ==========================================
  // مهارات الموظفين — Employee Skills
  // ==========================================
  app.get('/api/employee-skills', (req: Request, res: Response) => {
    const employeeId = queryString(req.query.employeeId);
    const skillId = queryString(req.query.skillId);
    const category = queryString(req.query.category);
    let list = erpStore.employeeSkills;
    if (employeeId) list = list.filter((item) => item.employeeId === employeeId);
    if (skillId) list = list.filter((item) => item.skillId === skillId);
    if (category) list = list.filter((item) => item.skillCategory === category);
    res.json(list);
  });

  app.post('/api/employee-skills', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const { employeeId, employeeName, skillId, level, proficiency, acquiredDate, expiryDate, notes } =
      req.body || {};
    if (!employeeId || !skillId) return res.status(400).json({ error: 'الموظف والمهارة مطلوبان.' });
    if (level !== undefined && !isLevel(level))
      return res.status(400).json({ error: `مستوى مهارة غير معروف: ${level}` });

    const skill = erpStore.skills.find((s) => s.id === skillId);
    if (!skill) return res.status(404).json({ error: 'المهارة غير موجودة.' });
    const now = new Date().toISOString();
    const employeeSkill: EmployeeSkill = {
      id: `es-${Date.now()}`,
      employeeId: String(employeeId),
      employeeName: String(employeeName || employeeId),
      skillId: skill.id,
      skillName: skill.name,
      skillCategory: skill.category,
      level: isLevel(level) ? level : skill.level,
      proficiency: boundedPercent(proficiency, 50),
      acquiredDate: String(acquiredDate || now.split('T')[0]),
      ...(expiryDate ? { expiryDate: String(expiryDate) } : {}),
      verified: false,
      ...(notes ? { notes: String(notes) } : {}),
      createdAt: now,
    };
    erpStore.employeeSkills.unshift(employeeSkill);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'EMPLOYEE_SKILL_ADDED',
      'EMPLOYEE_SKILL',
      employeeSkill.id,
      `ربط المهارة [${skill.name}] بالموظف ${employeeSkill.employeeName}`
    );
    res.status(201).json(employeeSkill);
  });

  app.delete('/api/employee-skills/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const index = erpStore.employeeSkills.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'ربط المهارة غير موجود.' });
    const [removed] = erpStore.employeeSkills.splice(index, 1);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'EMPLOYEE_SKILL_REMOVED',
      'EMPLOYEE_SKILL',
      removed.id,
      `حذف المهارة [${removed.skillName}] عن الموظف ${removed.employeeName}`
    );
    res.json({ success: true, deleted: removed.id });
  });

  // ==========================================
  // البرامج التدريبية والتسجيلات — Training
  // ==========================================
  app.get('/api/training-programs', (req: Request, res: Response) => {
    const category = queryString(req.query.category);
    const status = queryString(req.query.status);
    let list = erpStore.trainingPrograms;
    if (category) list = list.filter((program) => program.category === category);
    if (status) list = list.filter((program) => program.status === status);
    res.json(list);
  });

  app.post('/api/training-programs', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const {
      title,
      description,
      category,
      durationHours,
      maxParticipants,
      instructor,
      location,
      startDate,
      endDate,
      skillsGranted,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'عنوان البرنامج مطلوب.' });
    if (category !== undefined && !isCategory(category))
      return res.status(400).json({ error: `فئة برنامج غير معروفة: ${category}` });

    const now = new Date().toISOString();
    const program: TrainingProgram = {
      id: `trn-${Date.now()}`,
      code: `TRN-${new Date().getFullYear()}-${String(erpStore.trainingPrograms.length + 1).padStart(3, '0')}`,
      title: String(title),
      description: String(description || ''),
      category: isCategory(category) ? category : 'TRAINING',
      durationHours: Number(durationHours) || 0,
      maxParticipants: Number(maxParticipants) || 20,
      ...(instructor ? { instructor: String(instructor) } : {}),
      ...(location ? { location: String(location) } : {}),
      ...(startDate ? { startDate: String(startDate) } : {}),
      ...(endDate ? { endDate: String(endDate) } : {}),
      status: 'OPEN',
      skillsGranted: Array.isArray(skillsGranted) ? skillsGranted.map(String) : [],
      organizationId: user.organizationId,
      createdAt: now,
    };
    erpStore.trainingPrograms.unshift(program);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'TRAINING_PROGRAM_CREATED',
      'TRAINING_PROGRAM',
      program.id,
      `إنشاء برنامج تدريبي [${program.title}]`
    );
    res.status(201).json(program);
  });

  app.get('/api/training-enrollments', (req: Request, res: Response) => {
    const programId = queryString(req.query.programId);
    const employeeId = queryString(req.query.employeeId);
    let list = erpStore.trainingEnrollments;
    if (programId) list = list.filter((item) => item.programId === programId);
    if (employeeId) list = list.filter((item) => item.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/training-enrollments', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const { programId, employeeId, employeeName } = req.body || {};
    if (!programId || !employeeId) return res.status(400).json({ error: 'البرنامج والموظف مطلوبان.' });
    const program = erpStore.trainingPrograms.find((p) => p.id === programId);
    if (!program) return res.status(404).json({ error: 'البرنامج التدريبي غير موجود.' });
    if (program.maxParticipants > 0) {
      const enrolled = erpStore.trainingEnrollments.filter(
        (item) => item.programId === program.id && item.status !== 'DROPPED' && item.status !== 'FAILED'
      ).length;
      if (enrolled >= program.maxParticipants)
        return res.status(409).json({ error: 'اكتمل العدد الأقصى للبرنامج التدريبي.' });
    }

    const enrollment: TrainingEnrollment = {
      id: `enr-${Date.now()}`,
      programId: program.id,
      programTitle: program.title,
      employeeId: String(employeeId),
      employeeName: String(employeeName || employeeId),
      status: 'ENROLLED',
      progress: 0,
      enrolledAt: new Date().toISOString(),
    };
    erpStore.trainingEnrollments.unshift(enrollment);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'TRAINING_ENROLLED',
      'TRAINING_ENROLLMENT',
      enrollment.id,
      `تسجيل ${enrollment.employeeName} في [${program.title}]`
    );
    res.status(201).json(enrollment);
  });

  app.put('/api/training-enrollments/:id/progress', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const enrollment = erpStore.trainingEnrollments.find((item) => item.id === req.params.id);
    if (!enrollment) return res.status(404).json({ error: 'التسجيل غير موجود.' });
    const { progress, status, score } = req.body || {};
    if (status !== undefined && !ENROLLMENT_STATUSES.includes(status))
      return res.status(400).json({ error: `حالة تسجيل غير معروفة: ${status}` });

    if (progress !== undefined) enrollment.progress = boundedPercent(progress, enrollment.progress);
    if (status) enrollment.status = status;
    if (score !== undefined && Number.isFinite(Number(score))) enrollment.score = Number(score);
    if (enrollment.progress >= 100 && enrollment.status !== 'COMPLETED') {
      enrollment.status = 'COMPLETED';
      enrollment.completedAt = new Date().toISOString();
    }
    res.json(enrollment);
  });

  // ==========================================
  // مهارات الوكلاء الذكيين — AI Agent Skills
  // ==========================================
  app.get('/api/ai-agent-skills', (_req: Request, res: Response) => {
    res.json(erpStore.aiAgentSkills);
  });

  app.put('/api/ai-agent-skills/:id/toggle', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'system:admin');
    if (!user) return;
    const agentSkill = erpStore.aiAgentSkills.find((item) => item.id === req.params.id);
    if (!agentSkill) return res.status(404).json({ error: 'مهارة الوكيل غير موجودة.' });
    agentSkill.isEnabled = !agentSkill.isEnabled;
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      agentSkill.isEnabled ? 'AI_SKILL_ENABLED' : 'AI_SKILL_DISABLED',
      'AI_AGENT_SKILL',
      agentSkill.id,
      `${agentSkill.isEnabled ? 'تفعيل' : 'تعطيل'} مهارة الوكيل [${agentSkill.skillName}] على ${agentSkill.agentName}`
    );
    res.json(agentSkill);
  });

  // ==========================================
  // الإجراءات المحاسبية — Accounting Procedures
  // ==========================================
  app.get('/api/accounting-procedures', (req: Request, res: Response) => {
    const category = queryString(req.query.category);
    let list: AccountingProcedure[] = erpStore.accountingProcedures;
    if (category) list = list.filter((procedure) => procedure.category === category);
    res.json(list);
  });

  /**
   * تنفيذ إجراء محاسبي مسجَّل.
   * لا يُنشئ الإجراء قيوداً بنفسه: الخطوات المؤتمتة تُسجَّل في التدقيق ويُعاد
   * الإجراء للواجهة ليعرض خطواته؛ أي قيد فعلي يمرّ عبر مسار القيود المعتمد.
   */
  app.post('/api/accounting-procedures/:id/execute', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    const procedure = erpStore.accountingProcedures.find((p) => p.id === req.params.id);
    if (!procedure) return res.status(404).json({ error: 'الإجراء غير موجود.' });
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ACCOUNTING_PROCEDURE_EXECUTED',
      'ACCOUNTING_PROCEDURE',
      procedure.id,
      `تنفيذ إجراء محاسبي [${procedure.title}] — ${procedure.steps.length} خطوة`
    );
    res.json({
      success: true,
      message: `تم تنفيذ «${procedure.title}» بنجاح`,
      procedure,
      executedAt: new Date().toISOString(),
      executedBy: user.fullName,
      steps: procedure.steps.map((step) => ({
        order: step.order,
        title: step.title,
        automated: step.automated,
        action: step.automated ? 'SCHEDULED' : 'MANUAL_REVIEW_REQUIRED',
      })),
    });
  });
}
