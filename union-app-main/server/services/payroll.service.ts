import { erpStore } from '../db/store.js';
import { accountingService } from './accounting.service.js';
import { attendanceService } from './attendance.service.js';
import { findExpenseAccount, findTreasuryAccount, findAccountByCodeOrName } from '../utils/account-lookup.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { can } from '../security/permissions.js';
import type { PayrollLine, PayrollRun, User } from '../../src/types/erp.js';
import { PAYROLL_MONTHS_AR } from '../../src/types/erp.js';

/**
 * ===== خدمة شاشة المرتبات (مسير الرواتب الشهري) =====
 * - توليد مسير رواتب شهري تلقائياً من بيانات العاملين (استمارة 2 تأمينات)
 * - إضافة المكافآت والخصومات المعتمدة من الشئون الإدارية لذلك الشهر
 * - استقطاع أقساط السلف النشطة تلقائياً حتى السداد الكامل
 * - اعتماد المسير ثم ترحيله كقيد محاسبي متوازن (مصروف مرتبات / خزينة / سلف مستردة)
 */
export class PayrollService {
  private static readonly ROUND = (n: number) => Math.round(n * 100) / 100;

  public listRuns(): PayrollRun[] {
    return [...erpStore.payrollRuns].sort((a, b) =>
      b.year - a.year || b.month - a.month || b.createdAt.localeCompare(a.createdAt)
    );
  }

  public getRun(id: string): PayrollRun | undefined {
    return erpStore.payrollRuns.find((r) => r.id === id);
  }

  /**
   * توليد مسير مرتبات جديد لشهر معين (idempotent: يعيد التوليد للمسير المسودة القائم لنفس الشهر)
   * ===== الربط بالحضور والانصراف (بصمة وجه/إصبع) =====
   * عند وجود حركات بصمة للشهر — وما لم يُضبط useAttendance=false صراحةً —
   * تُولَّد سطور المسير بناءً على الحضور: خصم الغياب = (الأجر/30) × أيام الغياب،
   * مع مقابل عمل إضافي إن فُعِّل في إعدادات الحضور، وتظهر أيام الحضور/التأخير في السطر.
   */
  public generateRun(
    user: User,
    data: { year: number; month: number; notes?: string; useAttendance?: boolean }
  ): PayrollRun {
    const year = Number(data.year);
    const month = Number(data.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('سنة غير صحيحة.');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر يجب أن يكون بين 1 و 12.');

    const employees = erpStore.employees.filter((e) => e.status === 'ACTIVE');
    if (employees.length === 0) {
      throw new Error('لا يوجد عاملون نشطون في قاعدة البيانات (استمارة 2 تأمينات).');
    }

    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const existing = erpStore.payrollRuns.find((r) => r.year === year && r.month === month);

    if (existing && existing.status !== 'DRAFT') {
      throw new Error(`مسير ${PAYROLL_MONTHS_AR[month - 1]} ${year} موجود بالفعل بحالة [${existing.status === 'POSTED' ? 'مرحّل' : 'معتمد'}] ولا يمكن إعادة توليده.`);
    }

    const monthStart = `${monthPrefix}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];

    // الربط التلقائي بالحضور: يُفعَّل إن وُجدت حركات بصمة للشهر ولم يُستبعد صراحةً
    const monthHasAttendance = erpStore.attendanceRecords.some((r) => r.date.startsWith(monthPrefix));
    const basedOnAttendance = data.useAttendance !== false && monthHasAttendance;

    let attendanceDeductionSum = 0;
    let overtimePaySum = 0;

    const lines: PayrollLine[] = employees.map((emp) => {
      // المكافآت والخصومات المعتمدة لهذا الشهر لهذا العامل
      const affairs = erpStore.employeeAffairs.filter(
        (a) =>
          a.employeeId === emp.id &&
          a.status === 'APPROVED' &&
          a.startDate >= monthStart &&
          a.startDate <= monthEnd
      );
      const bonus = affairs
        .filter((a) => a.type === 'BONUS')
        .reduce((s, a) => s + (a.amount || 0), 0);
      const deduction = affairs
        .filter((a) => a.type === 'DEDUCTION')
        .reduce((s, a) => s + (a.amount || 0), 0);

      // أقساط السلف النشطة المستحقة هذا الشهر
      const activeAdvances = erpStore.employeeAdvances.filter(
        (a) => a.employeeId === emp.id && a.status === 'ACTIVE'
      );
      const advanceDeduction = activeAdvances.reduce(
        (s, a) => s + Math.min(a.installmentAmount, a.amount - a.paidAmount),
        0
      );

      const baseSalary = PayrollService.ROUND(emp.totalSalary);

      // بند الحضور والانصراف: ملخص الشهر ← خصم أيام الغياب (+ إضافي إن فُعِّل)
      let attendanceFields: Partial<PayrollLine> = {};
      let attendanceDeduction = 0;
      let overtimePay = 0;
      if (basedOnAttendance) {
        const summary = attendanceService.getMonthlySummary(emp, year, month);
        attendanceDeduction = summary.attendanceDeduction;
        if (erpStore.attendanceSettings.payOvertime && summary.totalOvertimeMinutes > 0) {
          const hourlyWage = emp.totalSalary / (erpStore.attendanceSettings.daySalaryDivisor * 8);
          overtimePay = PayrollService.ROUND(
            (summary.totalOvertimeMinutes / 60) * hourlyWage * erpStore.attendanceSettings.overtimeRate
          );
        }
        attendanceFields = {
          presentDays: summary.presentDays,
          absentDays: summary.absentDays,
          lateMinutes: summary.totalLateMinutes,
          overtimeMinutes: summary.totalOvertimeMinutes,
          attendanceDeduction: PayrollService.ROUND(attendanceDeduction),
        };
      }
      attendanceDeductionSum += attendanceDeduction;
      overtimePaySum += overtimePay;

      const netPayable = PayrollService.ROUND(baseSalary + bonus + overtimePay - deduction - advanceDeduction - attendanceDeduction);

      return {
        id: `pl-${emp.id}`,
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.fullName,
        baseSalary,
        bonus: PayrollService.ROUND(bonus),
        deduction: PayrollService.ROUND(deduction),
        advanceDeduction: PayrollService.ROUND(advanceDeduction),
        netPayable,
        ...attendanceFields,
      };
    });

    const totals = PayrollService.computeTotals(lines);
    if (basedOnAttendance) {
      totals.totalAttendanceDeduction = PayrollService.ROUND(attendanceDeductionSum);
      if (overtimePaySum > 0) totals.totalOvertimePay = PayrollService.ROUND(overtimePaySum);
    }
    const runNumber = `PR-${year}-${String(month).padStart(2, '0')}`;
    const now = new Date().toISOString();

    if (existing) {
      // إعادة توليد مسودة قائمة
      existing.lines = lines;
      existing.totals = totals;
      existing.basedOnAttendance = basedOnAttendance;
      existing.notes = data.notes?.trim() || existing.notes;
      existing.createdBy = user.fullName;
      existing.createdAt = now;

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'PAYROLL_REGENERATED',
        'PayrollRun',
        existing.id,
        `إعادة توليد مسير مرتبات [${runNumber}]${basedOnAttendance ? ' (مبني على الحضور والبصمة)' : ''} — ${totals.employeesCount} عاملاً بصافي ${totals.totalNet.toLocaleString()} ج.م`
      );
      return existing;
    }

    const run: PayrollRun = {
      id: `pay-${Date.now()}`,
      runNumber,
      year,
      month,
      monthLabelAr: `${PAYROLL_MONTHS_AR[month - 1]} ${year}`,
      status: 'DRAFT',
      organizationId: user.organizationId,
      lines,
      totals,
      basedOnAttendance,
      notes: data.notes?.trim(),
      createdBy: user.fullName,
      createdAt: now,
    };

    erpStore.payrollRuns.unshift(run);
    erpStore.addNotification({
      title: 'مسير مرتبات جديد (مسودة)',
      message: `تم توليد مسير مرتبات ${run.monthLabelAr} — ${totals.employeesCount} عاملاً بصافي ${totals.totalNet.toLocaleString()} ج.م بانتظار الاعتماد.`,
      type: 'HR_ALERT',
      severity: 'INFO',
      targetRole: 'ALL',
      organizationId: user.organizationId,
      actionTab: 'payroll',
      entityId: run.id,
    });

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'PAYROLL_GENERATED',
      'PayrollRun',
      run.id,
      `توليد مسير مرتبات [${runNumber}] لشهر ${run.monthLabelAr} — إجمالي الأساسي ${totals.totalBase.toLocaleString()} ج.م وصافي ${totals.totalNet.toLocaleString()} ج.م`,
      undefined,
      run
    );

    return run;
  }

  public approveRun(user: User, runId: string): PayrollRun {
    const run = this.getRun(runId);
    if (!run) throw new Error('المسير غير موجود.');
    if (run.status !== 'DRAFT') throw new Error('يُعتمد المسير من حالة مسودة فقط.');
    if (run.totals.employeesCount === 0) throw new Error('لا يمكن اعتماد مسير فارغ.');

    run.status = 'APPROVED';
    run.approvedBy = user.fullName;
    run.approvedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'PAYROLL_APPROVED',
      'PayrollRun',
      run.id,
      `اعتماد مسير مرتبات [${run.runNumber}] بصافي ${run.totals.totalNet.toLocaleString()} ج.م`
    );

    return run;
  }

  /**
   * ترحيل المسير المعتمد كقيد محاسبي:
   * مدين: مصروف المرتبات (الأساسي + المكافآت − الخصومات الإدارية)
   * دائن: الخزينة/البنك (الصافي المصروف) + حساب السلف المستردة (أقساط مستقطعة إن وجدت)
   */
  public postRun(user: User, runId: string): { run: PayrollRun; entry: any } {
    const run = this.getRun(runId);
    if (!run) throw new Error('المسير غير موجود.');
    if (run.status !== 'APPROVED') throw new Error('يجب اعتماد المسير قبل الترحيل.');

    const expenseAcc =
      findExpenseAccount('مرتب') ||
      findExpenseAccount('اجور') ||
      findExpenseAccount();
    const treasuryAcc =
      findTreasuryAccount() ||
      erpStore.accounts.find((a) => !a.isParent && a.isActive);
    if (!expenseAcc || !treasuryAcc) {
      throw new Error('تعذر تحديد حسابات المرتبات/الخزينة من دليل الحسابات النشط.');
    }

    const expenseAmount = PayrollService.ROUND(
      run.totals.totalBase +
        run.totals.totalBonus +
        (run.totals.totalOvertimePay || 0) -
        run.totals.totalDeduction -
        (run.totals.totalAttendanceDeduction || 0)
    );
    const netAmount = PayrollService.ROUND(run.totals.totalNet);
    const advanceAmount = PayrollService.ROUND(run.totals.totalAdvanceDeduction);
    const description = `صرف مرتبات شهر ${run.monthLabelAr} (${run.totals.employeesCount} عاملاً)`;

    const lines: any[] = [
      { accountId: expenseAcc.id, debit: expenseAmount, credit: 0, description },
      { accountId: treasuryAcc.id, debit: 0, credit: netAmount, description },
    ];

    if (advanceAmount > 0) {
      const advancesAcc =
        findAccountByCodeOrName('سلف') ||
        erpStore.accounts.find((a) => !a.isParent && a.isActive && normalizeNameIncludes(a.name, 'سلف')) ||
        findLiabilityFallback() ||
        treasuryAcc;
      lines.push({
        accountId: advancesAcc.id,
        debit: 0,
        credit: advanceAmount,
        description: 'استرداد أقساط سلف العاملين من المسير',
      });
    }

    const result = accountingService.createJournalEntry(
      {
        date: new Date().toISOString().split('T')[0],
        organizationId: run.organizationId,
        description: `${description} — مسير ${run.runNumber}`,
        type: 'MANUAL',
        sourceDocumentType: 'PAYROLL_RUN',
        sourceDocumentId: run.id,
        lines,
        userId: user.id,
      },
      user
    );

    // ترحيل القيد نهائياً لمن يملك صلاحية اعتماد وترحيل القيود
    if (can(user, 'journal:workflow')) {
      try {
        result.entry.status = 'APPROVED';
        accountingService.postJournalEntry(result.entry.id, user);
      } catch (err: any) {
        console.warn('[payroll] تعذر الترحيل النهائي للقيد — سيبقى معتمداً فقط:', err?.message);
      }
    }

    // تسجيل أقساط السلف المستقطعة فعلياً في حركات السلف
    if (advanceAmount > 0) {
      for (const line of run.lines) {
        if (line.advanceDeduction <= 0) continue;
        const empAdvances = erpStore.employeeAdvances.filter(
          (a) => a.employeeId === line.employeeId && a.status === 'ACTIVE'
        );
        let remaining = line.advanceDeduction;
        for (const adv of empAdvances) {
          if (remaining <= 0.001) break;
          const due = Math.min(adv.installmentAmount, adv.amount - adv.paidAmount, remaining);
          if (due <= 0.001) continue;
          adv.payments.push({
            id: `pay-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            amount: due,
            date: new Date().toISOString().split('T')[0],
            method: 'PAYROLL_DEDUCTION',
            notes: `استقطاع آلي بمسير ${run.runNumber}`,
            recordedBy: user.fullName,
          });
          adv.paidAmount = Math.min(adv.amount, adv.paidAmount + due);
          if (adv.paidAmount >= adv.amount - 0.001) adv.status = 'SETTLED';
          remaining = PayrollService.ROUND(remaining - due);
        }
      }
    }

    run.status = 'POSTED';
    run.journalEntryId = result.entry.id;
    run.postedBy = user.fullName;
    run.postedAt = new Date().toISOString();

    erpStore.addNotification({
      title: 'تم ترحيل مسير المرتبات',
      message: `مسير ${run.monthLabelAr} مرحّل محاسبياً بقيد رقم [${result.entry.entryNumber}] بصافي ${netAmount.toLocaleString()} ج.م.`,
      type: 'HR_ALERT',
      severity: 'SUCCESS',
      targetRole: 'ALL',
      organizationId: run.organizationId,
      actionTab: 'payroll',
      entityId: run.id,
    });

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      run.organizationId,
      'PAYROLL_POSTED',
      'PayrollRun',
      run.id,
      `ترحيل مسير مرتبات [${run.runNumber}] بالقيد [${result.entry.entryNumber}] — مصروف ${expenseAmount.toLocaleString()} ج.م وصافي صرف ${netAmount.toLocaleString()} ج.م${
        run.basedOnAttendance ? ` (مستند إلى الحضور: خصم غياب ${Number(run.totals.totalAttendanceDeduction || 0).toLocaleString()} ج.م)` : ''
      }`,
      { status: 'APPROVED' },
      { status: 'POSTED', journalEntryId: result.entry.id }
    );

    return { run, entry: result.entry };
  }

  public deleteDraftRun(user: User, runId: string): void {
    const index = erpStore.payrollRuns.findIndex((r) => r.id === runId);
    if (index === -1) throw new Error('المسير غير موجود.');
    const run = erpStore.payrollRuns[index];
    if (run.status !== 'DRAFT') throw new Error('لا يمكن حذف مسير معتمد أو مرحّل.');

    erpStore.payrollRuns.splice(index, 1);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'PAYROLL_DELETED',
      'PayrollRun',
      runId,
      `حذف مسودة مسير مرتبات [${run.runNumber}]`
    );
  }

  private static computeTotals(lines: PayrollLine[]): PayrollRun['totals'] {
    const sum = (fn: (l: PayrollLine) => number) =>
      PayrollService.ROUND(lines.reduce((s, l) => s + fn(l), 0));
    return {
      employeesCount: lines.length,
      totalBase: sum((l) => l.baseSalary),
      totalBonus: sum((l) => l.bonus),
      totalDeduction: sum((l) => l.deduction),
      totalAdvanceDeduction: sum((l) => l.advanceDeduction),
      totalNet: sum((l) => l.netPayable),
    };
  }
}

// أدوات مساعدة داخلية
function normalizeNameIncludes(name: string, keyword: string): boolean {
  return normalizeArabicText(name).includes(normalizeArabicText(keyword));
}

function findLiabilityFallback() {
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive && a.type === 'LIABILITY');
  return active[0];
}

export const payrollService = new PayrollService();
