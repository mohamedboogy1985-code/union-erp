import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { erpStore } from '../db/store.js';
import { attendanceService } from './attendance.service.js';
import { can } from '../security/permissions.js';
import { employeeDataBelongsToOrganization } from './hr-organization-data.js';
import type { Employee, User } from '../../src/types/erp.js';

/**
 * ===== بصمة اليد والوجه وربطها بالمراتب =====
 * - تسجيل قوالب البصمة (إصبع/وجه) لكل عامل، وتسجيل الحضور والانصراف بالبصمة.
 * - الربط بالمراتب لا يُطبَّق إلا باعتماد صريح من المستخدم المصرَّح له:
 *   «محمد عبد الله أحمد» (usr-mohamed-abdallah) — بغض النظر عن كونه مدير النظام.
 * - حالة الربط: غير مربوط ← طلب ربط ← معتمد/مرفوض، ومحفوظة في ملف بجانب بيانات البرنامج.
 */

export type PayrollLinkStatus = 'NOT_LINKED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BiometricEnrollment {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  methods: ('FINGERPRINT' | 'FACE')[];
  fingerQuality: number;
  faceQuality: number;
  faceThumbnail?: string;
  enrolledAt: string;
  enrolledBy: string;
  enrolledByName: string;
}

export interface PayrollLinkState {
  status: PayrollLinkStatus;
  requestedBy?: string;
  requestedByName?: string;
  requestedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  noteAr?: string;
  /** الشهر المطبَّق عليه الربط (اختياري) */
  appliedMonth?: string;
}

export interface BiometricPunchLog {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  method: 'FINGERPRINT' | 'FACE';
  direction: 'IN' | 'OUT';
  timestamp: string;
  score: number;
  deviceId?: string;
  simulated: boolean;
  messageAr: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const STORE_FILE = path.join(DATA_DIR, 'biometric-state.json');

/** المستخدمون المصرَّح لهم باعتماد ربط البصمة بالمراتب (بقرار المستخدم). */
export const BIOMETRIC_PAYROLL_APPROVERS = ['usr-mohamed-abdallah'];
const APPROVER_USERNAMES = ['mohamed.abdallah'];

export const isBiometricPayrollApprover = (user?: User | null): boolean => {
  if (!user) return false;
  if (BIOMETRIC_PAYROLL_APPROVERS.includes(user.id)) return true;
  return APPROVER_USERNAMES.includes(String(user.username ?? '').toLowerCase());
};

export const BIOMETRIC_APPROVER_NAME_AR = 'محمد عبد الله أحمد';

interface PersistedState {
  enrollments: Record<string, BiometricEnrollment>;
  punches: BiometricPunchLog[];
  payrollLink: PayrollLinkState;
}

/** بصمة الوجه/الإصبع في هذا البرنامج تحاكي العتاد عند غيابه، ولا تدّعي قراءة حقيقية بلا جهاز. */
export class BiometricService {
  private state: PersistedState = { enrollments: {}, punches: [], payrollLink: { status: 'NOT_LINKED' } };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as PersistedState;
        const enrollments = Object.fromEntries(
          Object.entries(raw.enrollments ?? {}).map(([id, enrollment]) => {
            const { faceThumbnail: _discardedImage, ...safeEnrollment } = enrollment;
            return [id, safeEnrollment];
          }),
        );
        this.state = {
          enrollments,
          punches: raw.punches ?? [],
          payrollLink: raw.payrollLink ?? { status: 'NOT_LINKED' },
        };
        if (Object.values(raw.enrollments ?? {}).some((enrollment) => Boolean(enrollment.faceThumbnail))) {
          this.persist();
        }
      }
    } catch {
      /* ملف تالف ⇒ نبدأ من حالة نظيفة */
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      /* الكتابة غير حرجة: الحالة تُحفظ في الذاكرة */
    }
  }

  private requireEmployee(employeeIdOrCode: string): Employee {
    const employees = erpStore.employees ?? [];
    const employee = employees.find((row) => row.id === employeeIdOrCode || row.employeeCode === employeeIdOrCode);
    if (!employee) throw new Error('العامل غير موجود في قاعدة البيانات (استمارة 2 تأمينات).');
    return employee;
  }

  public listEnrollments(): BiometricEnrollment[] {
    return Object.values(this.state.enrollments)
      .map(({ faceThumbnail: _discardedImage, ...enrollment }) => enrollment)
      .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));
  }

  public findEnrollment(employeeId: string): BiometricEnrollment | undefined {
    return this.state.enrollments[employeeId];
  }

  public payrollLink(): PayrollLinkState {
    return this.state.payrollLink;
  }

  /** هل الربط معمول به فعلياً في المسير؟ (مطلوب للتحقق منه في توليد المسير) */
  public isPayrollLinkApproved(): boolean {
    return this.state.payrollLink.status === 'APPROVED';
  }

  /** تسجيل بصمة عامل: إصبع و/أو وجه — يُنشئ قالباً ويُخزّنه مع مؤشر الجودة. */
  public enroll(
    user: User,
    data: {
      employeeId: string;
      methods?: ('FINGERPRINT' | 'FACE')[];
      fingerQuality?: number;
      faceQuality?: number;
      faceThumbnail?: string;
      deviceId?: string;
    },
  ): BiometricEnrollment {
    if (!can(user, 'attendance:manage')) throw new Error('تحتاج صلاحية إدارة الحضور لتسجيل البصمة.');
    const employee = this.requireEmployee(String(data.employeeId ?? ''));
    const methods = (data.methods?.length ? data.methods : (['FINGERPRINT', 'FACE'] as const)) as ('FINGERPRINT' | 'FACE')[];
    const fingerQuality = Math.max(0, Math.min(100, Number(data.fingerQuality ?? 92)));
    const faceQuality = Math.max(0, Math.min(100, Number(data.faceQuality ?? 88)));
    const previous = this.state.enrollments[employee.id];
    const enrollment: BiometricEnrollment = {
      id: previous?.id ?? `bio-${randomUUID().slice(0, 8)}`,
      organizationId: employee.organizationId,
      employeeId: employee.id,
      employeeCode: String(employee.employeeCode ?? ''),
      employeeName: String(employee.fullName ?? ''),
      methods: Array.from(new Set([...(previous?.methods ?? []), ...methods])),
      fingerQuality,
      faceQuality,
      enrolledAt: new Date().toISOString(),
      enrolledBy: user.id,
      enrolledByName: String(user.fullName ?? user.username ?? ''),
    };
    this.state.enrollments[employee.id] = enrollment;
    this.persist();
    return enrollment;
  }

  public removeEnrollment(user: User, employeeId: string): void {
    if (!can(user, 'attendance:manage')) throw new Error('تحتاج صلاحية إدارة الحضور لحذف البصمة.');
    delete this.state.enrollments[employeeId];
    this.persist();
  }

  /** تسجيل حضور/انصراف ببصمة اليد أو الوجه مع التحقق من وجود قالب مُسجَّل ل  عامل. */
  public punch(
    user: User,
    data: { employeeId: string; method: 'FINGERPRINT' | 'FACE'; direction?: 'IN' | 'OUT'; timestamp?: string; deviceId?: string; score?: number },
  ): { punch: BiometricPunchLog; record: ReturnType<typeof attendanceService.punch>['record'] } {
    if (!can(user, 'attendance:manage') && !can(user, 'journal:create')) {
      throw new Error('تحتاج صلاحية إدارة الحضور لتسجيل البصمة.');
    }
    const employee = this.requireEmployee(String(data.employeeId ?? ''));
    const enrollment = this.state.enrollments[employee.id];
    if (!enrollment) throw new Error(`مفيش بصمة مُسجَّلة للعامل ${employee.fullName} — سجّل بصمة الإصبع أو الوجه الأول.`);
    if (!enrollment.methods.includes(data.method)) {
      throw new Error(`القالب المسجَّل للعامل ${employee.fullName} لا يشمل ${data.method === 'FACE' ? 'بصمة الوجه' : 'بصمة الإصبع'}.`);
    }
    const threshold = data.method === 'FACE' ? enrollment.faceQuality : enrollment.fingerQuality;
    const score = Math.max(0, Math.min(100, Number(data.score ?? Math.max(threshold, 85))));
    if (score < 70) throw new Error('درجة المطابقة أقل من الحد المقبول (70%) — أعد المحاولة.');

    let result: ReturnType<typeof attendanceService.punch>;
    let alreadyComplete = false;
    try {
      result = attendanceService.punch(user, {
        employeeId: employee.id,
        method: data.method,
        direction: data.direction,
        timestamp: data.timestamp,
        deviceId: data.deviceId,
        verificationScore: score,
        notes: data.method === 'FACE' ? 'بصمة وجه' : 'بصمة إصبع',
      });
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (!message.includes('بالفعل')) throw err;
      alreadyComplete = true;
      const todayPunches = this.state.punches.filter(
        (row) => row.employeeId === employee.id && row.timestamp.slice(0, 10) === new Date().toISOString().slice(0, 10),
      );
      result = {
        direction: todayPunches.some((row) => row.direction === 'IN') && !todayPunches.some((row) => row.direction === 'OUT') ? 'OUT' : todayPunches.length % 2 === 0 ? 'IN' : 'OUT',
        record: undefined,
        message: 'تحقّق بصمة مسجَّل — الحضور والانصراف لهذا اليوم مكتمل بالفعل.',
      } as unknown as ReturnType<typeof attendanceService.punch>;
    }

    const punch: BiometricPunchLog = {
      id: `bp-${randomUUID().slice(0, 8)}`,
      organizationId: employee.organizationId,
      employeeId: employee.id,
      employeeName: String(employee.fullName ?? ''),
      method: data.method,
      direction: result.direction,
      timestamp: new Date(data.timestamp ?? Date.now()).toISOString(),
      score,
      deviceId: data.deviceId,
      simulated: true,
      messageAr: alreadyComplete ? `${result.message} (الحركة مقيَّدة بسجل الحضور اليومي)` : result.message,
    };
    this.state.punches.unshift(punch);
    this.state.punches = this.state.punches.slice(0, 500);
    this.persist();
    return { punch, record: result.record };
  }

  public listPunches(limit = 60): BiometricPunchLog[] {
    return this.state.punches.slice(0, limit);
  }

  /** طلب ربط البصمة بالمراتب — يحتاج صلاحية إدارة الحضور، ولا يُفعَّل إلا باعتماد محمد عبد الله. */
  public requestPayrollLink(user: User, noteAr?: string, appliedMonth?: string): PayrollLinkState {
    if (!can(user, 'attendance:manage')) throw new Error('تحتاج صلاحية إدارة الحضور لطلب الربط.');
    if (this.state.payrollLink.status === 'APPROVED') throw new Error('الربط معتمد بالفعل — لا حاجة لطلب جديد.');
    this.state.payrollLink = {
      status: 'PENDING',
      requestedBy: user.id,
      requestedByName: String(user.fullName ?? user.username ?? ''),
      requestedAt: new Date().toISOString(),
      noteAr: noteAr || 'طلب ربط بصمة الحضور بالمراتب (خصم الغياب والتأخير).',
      appliedMonth,
    };
    this.persist();
    return this.state.payrollLink;
  }

  /** الاعتماد أو عدم الاعتماد — مقصور على محمد عبد الله أحمد. */
  public decidePayrollLink(user: User, approved: boolean, noteAr?: string): PayrollLinkState {
    if (!isBiometricPayrollApprover(user)) {
      throw new Error(`اعتماد ربط البصمة بالمراتب مقصور على ${BIOMETRIC_APPROVER_NAME_AR}.`);
    }
    this.state.payrollLink = {
      ...this.state.payrollLink,
      status: approved ? 'APPROVED' : 'REJECTED',
      decidedBy: user.id,
      decidedByName: String(user.fullName ?? user.username ?? ''),
      decidedAt: new Date().toISOString(),
      noteAr: noteAr || (approved ? 'اعتُمد ربط البصمة بالمراتب — تُخصم الغياب والتأخير في المسير.' : 'لم يُعتمد الربط — المسير بدون خصومات بصمة.'),
    };
    this.persist();
    return this.state.payrollLink;
  }

  /** نظرة كاملة لشاشة البصمة: الأجهزة + القوالب + السجلات + ملخص الشهر + حالة الربط. */
  public overview(year?: number, month?: number, user?: User | null, organizationId = user?.organizationId) {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth() + 1;
    const employees = (erpStore.employees ?? []).filter(
      (employee) => Boolean(organizationId) && employee.organizationId === organizationId && employee.status === 'ACTIVE',
    );
    const scopedOrganizationId = organizationId ?? '';
    const employeeIds = new Set(employees.map((employee) => employee.id));
    const enrollments = this.listEnrollments().filter(
      (enrollment) =>
        employeeIds.has(enrollment.employeeId) &&
        employeeDataBelongsToOrganization(enrollment.employeeId, scopedOrganizationId, enrollment.organizationId),
    );
    const punches = this.listPunches().filter(
      (punch) =>
        employeeIds.has(punch.employeeId) &&
        employeeDataBelongsToOrganization(punch.employeeId, scopedOrganizationId, punch.organizationId),
    );
    const summaries = employees
      .map((employee) => {
        try {
          return attendanceService.getMonthlySummary(employee, targetYear, targetMonth);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const link = this.state.payrollLink;
    return {
      year: targetYear,
      month: targetMonth,
      devices: attendanceService.listDevices(),
      settings: attendanceService.getSettings(),
      employees: employees.map((employee) => ({
        id: employee.id,
        code: employee.employeeCode,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        enrolled: enrollments.some((enrollment) => enrollment.employeeId === employee.id),
      })),
      enrollments,
      punches,
      summaries,
      payrollLink: link,
      canRequestLink: user ? can(user, 'attendance:manage') : false,
      canDecideLink: isBiometricPayrollApprover(user),
      approverNameAr: BIOMETRIC_APPROVER_NAME_AR,
      effectsAr: [
        'ربط البصمة بالمراتب يعني خصم الغياب والتأخير في مسير الشهر تلقائياً من سجلات البصمة.',
        'قبل الاعتماد يُولَّد المسير بدون أي خصم بصمة (full salary) حتى لو وُجدت سجلات حضور.',
        'بعد الاعتماد يُسجَّل اسم المعتمد وتاريخ الاعتماد في المسير وفي سجل التدقيق.',
      ],
    };
  }
}

export const biometricService = new BiometricService();
