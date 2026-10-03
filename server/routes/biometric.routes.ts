import { Router } from 'express';
import type { Request, Response } from 'express';
import { biometricService, isBiometricPayrollApprover, BIOMETRIC_APPROVER_NAME_AR } from '../services/biometric.service.js';
import { payrollService } from '../services/payroll.service.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';

interface BiometricRouterDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
}

/** مسارات البصمة — القراءة والتعديل محصوران بصلاحيات الموارد البشرية/الحضور. */
export const createBiometricRouter = (deps: BiometricRouterDeps): Router => {
  const router = Router();

  const actor = (req: Request, res: Response, permission: string): User | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return null;
    }
    if (!can(user, permission)) {
      res.status(403).json({ error: 'تحتاج صلاحية مناسبة لإدارة الحضور والبيانات الحيوية.' });
      return null;
    }
    return user;
  };

  const canReadBiometric = (req: Request, res: Response): User | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول صالح.' });
      return null;
    }
    if (!can(user, 'attendance:manage') && !can(user, 'hr:manage')) {
      res.status(403).json({ error: 'تحتاج صلاحية إدارة الحضور أو الموارد البشرية لقراءة بيانات البصمة.' });
      return null;
    }
    return user;
  };

  router.get('/overview', (req: Request, res: Response) => {
    const user = canReadBiometric(req, res);
    if (!user) return;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    res.json(biometricService.overview(year, month, user));
  });

  router.get('/link', (req: Request, res: Response) => {
    const user = canReadBiometric(req, res);
    if (!user) return;
    res.json({
      ...biometricService.payrollLink(),
      approverNameAr: BIOMETRIC_APPROVER_NAME_AR,
      effectsAr: biometricService.overview().effectsAr,
    });
  });

  router.post('/enroll', (req: Request, res: Response) => {
    const user = actor(req, res, 'attendance:manage');
    if (!user) return;
    try {
      // صورة الوجه تُستخدم محلياً للمعاينة فقط ولا تُحفظ على الخادم.
      const { faceThumbnail: _discardedImage, ...enrollmentInput } = req.body ?? {};
      const enrollment = biometricService.enroll(user, enrollmentInput);
      deps.auditWrite?.({ action: 'BIOMETRIC_ENROLLMENT_CHANGED', actorId: user.id, methodsCount: enrollment.methods.length });
      res.status(201).json(enrollment);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/enroll/:employeeId', (req: Request, res: Response) => {
    const user = actor(req, res, 'attendance:manage');
    if (!user) return;
    try {
      biometricService.removeEnrollment(user, req.params.employeeId);
      deps.auditWrite?.({ action: 'BIOMETRIC_ENROLLMENT_REMOVED', actorId: user.id });
      res.json({ success: true, message: 'حُذف قالب البصمة.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/punch', (req: Request, res: Response) => {
    const user = actor(req, res, 'attendance:manage');
    if (!user) return;
    try {
      const result = biometricService.punch(user, req.body ?? {});
      deps.auditWrite?.({ action: 'BIOMETRIC_PUNCH_RECORDED', actorId: user.id, simulated: result.punch.simulated });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/payroll-link/request', (req: Request, res: Response) => {
    const user = actor(req, res, 'attendance:manage');
    if (!user) return;
    try {
      const note = typeof req.body?.noteAr === 'string' ? req.body.noteAr.trim().slice(0, 300) : undefined;
      const appliedMonth = typeof req.body?.appliedMonth === 'string' ? req.body.appliedMonth.slice(0, 7) : undefined;
      const state = biometricService.requestPayrollLink(user, note, appliedMonth);
      deps.auditWrite?.({ action: 'BIOMETRIC_LINK_REQUESTED', actorId: user.id, hasMonth: Boolean(state.appliedMonth) });
      res.status(201).json(state);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/payroll-link/decide', (req: Request, res: Response) => {
    const user = actor(req, res, 'hr:manage');
    if (!user) return;
    if (!isBiometricPayrollApprover(user)) {
      res.status(403).json({ error: `اعتماد ربط البصمة بالمراتب مقصور على ${BIOMETRIC_APPROVER_NAME_AR}.` });
      return;
    }
    const approved = req.body?.approved !== false;
    try {
      const note = typeof req.body?.noteAr === 'string' ? req.body.noteAr.trim().slice(0, 300) : undefined;
      const state = biometricService.decidePayrollLink(user, approved, note);
      deps.auditWrite?.({ action: approved ? 'BIOMETRIC_LINK_APPROVED' : 'BIOMETRIC_LINK_REJECTED', actorId: user.id });
      res.json(state);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/payroll/generate', (req: Request, res: Response) => {
    const user = actor(req, res, 'hr:manage');
    if (!user) return;
    try {
      const run = payrollService.generateRun(user, {
        year: Number(req.body?.year) || new Date().getFullYear(),
        month: Number(req.body?.month) || new Date().getMonth() + 1,
        useAttendance: biometricService.isPayrollLinkApproved(),
        notes: biometricService.isPayrollLinkApproved()
          ? 'مسير مبني على بصمة الحضور (ربط معتمد)'
          : 'مسير بدون ربط بصمة (الربط غير معتمد)',
      });
      deps.auditWrite?.({ action: 'PAYROLL_GENERATED_FROM_BIOMETRIC', actorId: user.id, basedOnAttendance: run.basedOnAttendance });
      res.status(201).json(run);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
