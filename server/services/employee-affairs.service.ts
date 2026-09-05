import fs from 'fs';
import path from 'path';
import { erpStore } from '../db/store.js';
import { regulationService } from './regulation.service.js';
import { parseCsv } from '../utils/csv.js';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';
import type {
  Employee,
  EmployeeAffair,
  EmployeeAffairType,
  EmployeeAdvance,
  EmployeeAffairsSummary,
  User,
} from '../../src/types/erp.js';

/**
 * ===== خدمة شئون العاملين (استكمال وحدة شئون العاملين) =====
 * - زرع بيانات العاملين من ملف «استمارة 2 تأمينات» الحقيقي (server/data)
 * - إدارة الشئون الإدارية: إجازات / مرضيات / أذونات / إنذارات / خصومات / مكافآت
 * - إدارة سلف العاملين وأقساطها حتى السداد الكامل
 * - ملخص إحصائي: فجوة تحصيل حصة النقابة بين استمارة 2 والمستقطع الفعلي
 */

const MODULE_DIR = moduleDir(typeof import.meta !== 'undefined' ? import.meta.url : undefined) || process.cwd();

export const EMPLOYEE_DATA_DIR =
  resolveFirst([
    process.env.UNION_DATA_DIR,
    path.join(process.cwd(), 'server', 'data'),
    path.join(MODULE_DIR, '..', 'data'),
    path.join(MODULE_DIR, 'server', 'data'),
    path.join(MODULE_DIR, '..', 'server', 'data'),
    path.join(MODULE_DIR, '..', '..', 'server', 'data'),
  ]) || path.join(process.cwd(), 'server', 'data');

const INSURANCE_FORM2_FILE = 'استمارة_2_تأمينات.csv';

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export class EmployeeAffairsService {
  /**
   * زرع العاملين من استمارة 2 تأمينات (idempotent — لا يُعيد الزرع إن كانت البيانية محملة).
   * بنية الملف: صفان رؤوس ثم صفوف البيانات:
   * [الاسم، الأجر الشامل، الأجر التأميني، حصة النقابة(استمارة 2)، حصة العامل(استمارة 2)، حصة النقابة(المخصوم)، حصة العامل(المخصوم)]
   */
  public loadEmployeesFromInsuranceCsv(): { loaded: number; skipped: boolean } {
    if (erpStore.employees.length > 0) {
      return { loaded: 0, skipped: true };
    }

    const filePath = path.join(EMPLOYEE_DATA_DIR, INSURANCE_FORM2_FILE);
    if (!fs.existsSync(filePath)) {
      console.warn(`[employee-affairs] لم يُعثر على ملف استمارة 2 تأمينات: ${filePath}`);
      return { loaded: 0, skipped: true };
    }

    try {
      const rows = parseCsv(fs.readFileSync(filePath, 'utf-8'));
      // تخطي صفّي الرؤوس
      const dataRows = rows.slice(2).filter((r) => r[0] && r[0].trim().length > 1);

      erpStore.employees = dataRows.map((row, index) => {
        const employee: Employee = {
          id: `emp-${String(index + 1).padStart(3, '0')}`,
          employeeCode: `EMP-${String(index + 1).padStart(3, '0')}`,
          fullName: row[0].trim(),
          totalSalary: num(row[1]),
          insuranceSalary: num(row[2]),
          unionShareForm2: num(row[3]),
          workerShareForm2: num(row[4]),
          unionShareDeducted: num(row[5]),
          workerShareDeducted: num(row[6]),
          status: 'ACTIVE',
          source: 'استمارة 2 تأمينات',
        };
        return employee;
      });

      console.log(`[employee-affairs] تم تحميل ${erpStore.employees.length} عاملاً من استمارة 2 تأمينات.`);
      return { loaded: erpStore.employees.length, skipped: false };
    } catch (err: any) {
      console.error(`[employee-affairs] فشل تحميل استمارة 2 تأمينات: ${err.message}`);
      return { loaded: 0, skipped: true };
    }
  }

  public listEmployees(search?: string): Employee[] {
    let list = erpStore.employees;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) => e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)
      );
    }
    return list;
  }

  public getEmployee(employeeId: string): Employee | undefined {
    return erpStore.employees.find((e) => e.id === employeeId);
  }

  // ================= الشئون الإدارية =================

  public listAffairs(params: { employeeId?: string; type?: EmployeeAffairType; status?: string } = {}): EmployeeAffair[] {
    return erpStore.employeeAffairs.filter(
      (a) =>
        (!params.employeeId || a.employeeId === params.employeeId) &&
        (!params.type || a.type === params.type) &&
        (!params.status || a.status === params.status)
    );
  }

  public addAffair(
    user: User,
    data: {
      employeeId: string;
      type: EmployeeAffairType;
      startDate: string;
      endDate?: string;
      days?: number;
      amount?: number;
      reason: string;
    }
  ): EmployeeAffair {
    const employee = this.getEmployee(data.employeeId);
    if (!employee) {
      throw new Error('العامل غير موجود في قاعدة بيانات استمارة 2 تأمينات.');
    }
    if (!data.startDate || !data.reason?.trim()) {
      throw new Error('تاريخ البداية والسبب حقول إلزامية.');
    }

    const affair: EmployeeAffair = {
      id: `aff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId: employee.id,
      employeeName: employee.fullName,
      type: data.type,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days ? Number(data.days) : undefined,
      amount: data.amount ? Number(data.amount) : undefined,
      reason: data.reason.trim(),
      status: 'PENDING',
      createdBy: user.fullName,
      createdAt: new Date().toISOString(),
    };

    erpStore.employeeAffairs.unshift(affair);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'HR_AFFAIR_CREATE',
      'EmployeeAffair',
      affair.id,
      `تسجيل شأن إداري [${affair.type}] للعامل ${employee.fullName} بتاريخ ${affair.startDate}`,
      undefined,
      affair
    );

    erpStore.addNotification({
      title: 'شأن إداري جديد بانتظار الاعتماد',
      message: `${affair.employeeName} — ${affair.type === 'SICK_LEAVE' ? 'إجازة مرضية' : affair.type === 'ANNUAL_LEAVE' ? 'إجازة سنوية' : 'شأن إداري'} بتاريخ ${affair.startDate}`,
      type: 'HR_ALERT',
      severity: 'INFO',
      targetRole: 'ALL',
      organizationId: user.organizationId,
      actionTab: 'employees',
      entityId: affair.id,
    });

    return affair;
  }

  public decideAffair(user: User, affairId: string, decision: 'APPROVED' | 'REJECTED'): EmployeeAffair {
    const affair = erpStore.employeeAffairs.find((a) => a.id === affairId);
    if (!affair) throw new Error('الشأن الإداري غير موجود.');
    if (affair.status !== 'PENDING') throw new Error('تم البت في هذا الشأن مسبقاً.');

    affair.status = decision;
    affair.decidedBy = user.fullName;
    affair.decidedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      decision === 'APPROVED' ? 'HR_AFFAIR_APPROVE' : 'HR_AFFAIR_REJECT',
      'EmployeeAffair',
      affair.id,
      `${decision === 'APPROVED' ? 'اعتماد' : 'رفض'} الشأن الإداري للعامل ${affair.employeeName} (${affair.type})`,
      undefined,
      affair
    );

    return affair;
  }

  public deleteAffair(user: User, affairId: string): void {
    const index = erpStore.employeeAffairs.findIndex((a) => a.id === affairId);
    if (index === -1) throw new Error('الشأن الإداري غير موجود.');

    const [removed] = erpStore.employeeAffairs.splice(index, 1);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'HR_AFFAIR_DELETE',
      'EmployeeAffair',
      affairId,
      `حذف الشأن الإداري للعامل ${removed.employeeName} (${removed.type})`,
      removed,
      undefined
    );
  }

  // ================= سلف العاملين =================

  public listAdvances(employeeId?: string): EmployeeAdvance[] {
    return erpStore.employeeAdvances.filter((a) => !employeeId || a.employeeId === employeeId);
  }

  public addAdvance(
    user: User,
    data: { employeeId: string; amount: number; installmentAmount: number; issueDate: string; reason?: string }
  ): EmployeeAdvance {
    const employee = this.getEmployee(data.employeeId);
    if (!employee) throw new Error('العامل غير موجود في قاعدة بيانات استمارة 2 تأمينات.');

    const amount = Number(data.amount);
    const installmentAmount = Number(data.installmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('قيمة السلفة يجب أن تكون رقماً موجباً.');
    if (!Number.isFinite(installmentAmount) || installmentAmount <= 0)
      throw new Error('قيمة القسط الشهري يجب أن تكون رقماً موجباً.');
    if (installmentAmount > amount) throw new Error('قيمة القسط لا يمكن أن تتجاوز قيمة السلفة.');
    if (!data.issueDate) throw new Error('تاريخ الصرف إلزامي.');

    // ===== اللائحة المالية: سقف السلف كنسبة من أجر العامل (خامل حتى ترقيم اللائحة) =====
    const regViolations = regulationService.checkEmployeeAdvance({
      amount,
      annualOrMonthlySalary: employee.totalSalary,
    });
    const blocking = regViolations.find((v) => v.severity === 'BLOCK');
    if (blocking) {
      throw new Error(`مخالفة اللائحة المالية: ${blocking.message}`);
    }
    for (const v of regViolations) {
      erpStore.addNotification({
        title: 'تنبيه توافق مع اللائحة المالية',
        message: `${v.message} — سلفة العامل ${employee.fullName}`,
        type: 'HR_ALERT',
        severity: 'WARNING',
        targetRole: 'ALL',
        organizationId: user.organizationId,
        actionTab: 'advances',
        entityId: employee.id,
      });
    }

    const advance: EmployeeAdvance = {
      id: `adv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId: employee.id,
      employeeName: employee.fullName,
      amount,
      paidAmount: 0,
      installmentAmount,
      issueDate: data.issueDate,
      status: 'ACTIVE',
      reason: data.reason?.trim(),
      payments: [],
      createdBy: user.fullName,
      createdAt: new Date().toISOString(),
    };

    erpStore.employeeAdvances.unshift(advance);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'HR_ADVANCE_CREATE',
      'EmployeeAdvance',
      advance.id,
      `صرف سلفة ${amount.toLocaleString()} ج.م للعامل ${employee.fullName} بقسط ${installmentAmount.toLocaleString()} ج.م`,
      undefined,
      advance
    );

    return advance;
  }

  public payInstallment(
    user: User,
    advanceId: string,
    payment: { amount: number; date: string; method?: 'CASH' | 'BANK_TRANSFER' | 'PAYROLL_DEDUCTION'; notes?: string }
  ): EmployeeAdvance {
    const advance = erpStore.employeeAdvances.find((a) => a.id === advanceId);
    if (!advance) throw new Error('السلفة غير موجودة.');
    if (advance.status === 'SETTLED') throw new Error('هذه السلفة مسددة بالكامل.');

    const remaining = advance.amount - advance.paidAmount;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('قيمة القسط يجب أن تكون رقماً موجباً.');
    if (amount > remaining + 0.001) {
      throw new Error(`قيمة القسط تتجاوز المتبقي (${remaining.toLocaleString()} ج.م).`);
    }

    advance.payments.push({
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount,
      date: payment.date || new Date().toISOString().split('T')[0],
      method: payment.method || 'PAYROLL_DEDUCTION',
      notes: payment.notes,
      recordedBy: user.fullName,
    });
    advance.paidAmount = Math.min(advance.amount, advance.paidAmount + amount);
    if (advance.paidAmount >= advance.amount - 0.001) {
      advance.status = 'SETTLED';
      erpStore.addNotification({
        title: 'سداد سلفة عامل بالكامل',
        message: `تم سداد سلفة ${advance.employeeName} (${advance.amount.toLocaleString()} ج.م) بالكامل.`,
        type: 'SYSTEM',
        severity: 'SUCCESS',
        targetRole: 'ALL',
        organizationId: user.organizationId,
        actionTab: 'advances',
        entityId: advance.id,
      });
    }

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'HR_ADVANCE_PAYMENT',
      'EmployeeAdvance',
      advance.id,
      `سداد قسط ${amount.toLocaleString()} ج.م من سلفة ${advance.employeeName} — المتبقي ${(advance.amount - advance.paidAmount).toLocaleString()} ج.م`,
      undefined,
      advance
    );

    return advance;
  }

  public deleteAdvance(user: User, advanceId: string): void {
    const index = erpStore.employeeAdvances.findIndex((a) => a.id === advanceId);
    if (index === -1) throw new Error('السلفة غير موجودة.');

    const [removed] = erpStore.employeeAdvances.splice(index, 1);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'HR_ADVANCE_DELETE',
      'EmployeeAdvance',
      advanceId,
      `حذف سلفة العامل ${removed.employeeName} بقيمة ${removed.amount.toLocaleString()} ج.م`,
      removed,
      undefined
    );
  }

  // ================= الملخص الإحصائي =================

  public getSummary(): EmployeeAffairsSummary {
    const employees = erpStore.employees;
    const totalSalaries = employees.reduce((s, e) => s + e.totalSalary, 0);
    const totalInsuranceSalaries = employees.reduce((s, e) => s + e.insuranceSalary, 0);
    const totalUnionShareForm2 = employees.reduce((s, e) => s + e.unionShareForm2, 0);
    const totalUnionShareDeducted = employees.reduce((s, e) => s + e.unionShareDeducted, 0);

    const affairs = erpStore.employeeAffairs;
    const today = new Date().toISOString().split('T')[0];
    const onLeaveToday = affairs.filter(
      (a) =>
        a.status === 'APPROVED' &&
        (a.type === 'ANNUAL_LEAVE' || a.type === 'SICK_LEAVE' || a.type === 'CASUAL_LEAVE') &&
        a.startDate <= today &&
        (!a.endDate || a.endDate >= today)
    ).length;

    const advances = erpStore.employeeAdvances;
    const totalAdvanceAmount = advances.reduce((s, a) => s + a.amount, 0);
    const totalPaid = advances.reduce((s, a) => s + a.paidAmount, 0);

    return {
      employeesCount: employees.length,
      totalSalaries,
      totalInsuranceSalaries,
      totalUnionShareForm2,
      totalUnionShareDeducted,
      collectionGap: totalUnionShareForm2 - totalUnionShareDeducted,
      affairs: {
        total: affairs.length,
        pending: affairs.filter((a) => a.status === 'PENDING').length,
        approved: affairs.filter((a) => a.status === 'APPROVED').length,
        rejected: affairs.filter((a) => a.status === 'REJECTED').length,
        onLeaveToday,
      },
      advances: {
        totalAmount: totalAdvanceAmount,
        remaining: totalAdvanceAmount - totalPaid,
        active: advances.filter((a) => a.status === 'ACTIVE').length,
        settled: advances.filter((a) => a.status === 'SETTLED').length,
      },
    };
  }
}

export const employeeAffairsService = new EmployeeAffairsService();
