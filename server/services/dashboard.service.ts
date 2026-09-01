import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { cacheService, CACHE_KEYS } from './cache.service.js';
import { notificationService } from './notification.service.js';
import type { SmartDashboardSummary } from '../../src/types/erp.js';
import { findDebtorsAccount } from '../utils/account-lookup.js';

/**
 * ===== IMPROVEMENTS.md 6.1: Dashboard ذكي =====
 * لوحة تحكم تفاعلية: ملخص الأرصدة + الإنذارات الذكية + الرسوم البيانية
 * مع تخزين مؤقت (IMPROVEMENTS 7.1) وتنبيهات تلقائية (IMPROVEMENTS 8.2)
 */

/** حد الإنذار لمديونية الطرف الواحد في 1301 */
const DEBTOR_ALERT_THRESHOLD = Number(process.env.DEBTOR_ALERT_THRESHOLD || 150000);

export class DashboardService {
  /**
   * الملخص الذكي الكامل للوحة التحكم (مع كاش 60 ثانية)
   */
  public async getSmartSummary(organizationId?: string): Promise<SmartDashboardSummary> {
    return cacheService.wrap(CACHE_KEYS.dashboardSummary(organizationId), async () => this.buildSummary(organizationId), 60);
  }

  private buildSummary(organizationId?: string): SmartDashboardSummary {
    const tb = reportsService.getTrialBalance({ organizationId });
    const ie = reportsService.getIncomeExpenseReport({ organizationId });

    // ===== 1) ملخص الأرصدة من ميزان المراجعة =====
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let cashPosition = 0;

    for (const acc of erpStore.accounts) {
      if (acc.isParent || !acc.isActive) continue;
      const positive = acc.currentBalance > 0 ? acc.currentBalance : -acc.currentBalance;
      switch (acc.type) {
        case 'ASSET':
          totalAssets += positive;
          if (['1101', '1102', '1103'].includes(acc.code)) cashPosition += positive;
          break;
        case 'LIABILITY':
          totalLiabilities += positive;
          break;
        case 'EQUITY':
          totalEquity += positive;
          break;
        case 'REVENUE':
          totalRevenue += positive;
          break;
        case 'EXPENSE':
          totalExpenses += positive;
          break;
      }
    }

    const _debtorsAccount = findDebtorsAccount();
    const debtors1301 = _debtorsAccount ? erpStore.getSubledgerPartiesForAccount(_debtorsAccount.id) : [];
    const debtors1301Total = debtors1301.reduce((s, p) => s + p.currentBalance, 0);

    // ===== 2) الإنذارات الذكية =====
    const pendingApprovals = erpStore.journalEntries.filter(
      (e) => (!organizationId || e.organizationId === organizationId) && (e.status === 'SUBMITTED' || e.status === 'DRAFT')
    ).length;

    const failedOCRDocuments = erpStore.ocrProcessingRecords.filter((r) => r.status === 'FAILED').length;

    const unbalancedEntries = erpStore.journalEntries.filter(
      (e) => Math.abs(e.totalDebit - e.totalCredit) > 0.005
    ).length;

    const highRiskDebtors = debtors1301.filter((p) => p.currentBalance >= DEBTOR_ALERT_THRESHOLD).length;

    const budgetOverruns = erpStore.budgets.flatMap((b) =>
      b.lines.filter((l) => l.actualAmount + l.committedAmount > l.allocatedAmount)
    ).length;

    let lockedUsers = 0;
    erpStore.userSecurity.forEach((state) => {
      if (state.lockedUntil && new Date(state.lockedUntil) > new Date()) lockedUsers++;
    });

    // ===== 3) الرسوم البيانية =====
    // اتجاه المصروفات شهرياً (من القيود المرحلة)
    const expensesByMonth = new Map<string, number>();
    const revenueByMonth = new Map<string, number>();
    const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    for (const entry of erpStore.journalEntries) {
      if (entry.status !== 'POSTED') continue;
      if (organizationId && entry.organizationId !== organizationId) continue;
      const monthKey = entry.date.slice(0, 7); // YYYY-MM
      const monthLabel = monthNamesAr[Number(entry.date.slice(5, 7)) - 1] + ' ' + entry.date.slice(0, 4);
      for (const line of entry.lines) {
        const acc = erpStore.getAccountById(line.accountId);
        if (!acc) continue;
        const value = line.debit - line.credit;
        if (acc.type === 'EXPENSE') {
          expensesByMonth.set(monthLabel, (expensesByMonth.get(monthLabel) || 0) + Math.max(0, value));
        } else if (acc.type === 'REVENUE') {
          revenueByMonth.set(monthLabel, (revenueByMonth.get(monthLabel) || 0) + Math.max(0, line.credit - line.debit));
        }
      }
    }

    const expensesTrend = [...expensesByMonth.entries()].map(([label, value]) => ({ label, value: Math.round(value) }));

    // الإيراد حسب الفئة (حسابات الإيرادات التفصيلية)
    const revenueByCategory: { label: string; value: number }[] = [];
    for (const acc of erpStore.accounts) {
      if (acc.type === 'REVENUE' && !acc.isParent && acc.currentBalance > 0) {
        revenueByCategory.push({ label: acc.name, value: Math.round(acc.currentBalance) });
      }
    }

    // توزيع الحسابات حسب النوع
    const typeNamesAr: Record<string, string> = {
      ASSET: 'الأصول',
      LIABILITY: 'الالتزامات',
      EQUITY: 'حقوق الملكية',
      REVENUE: 'الإيرادات',
      EXPENSE: 'المصروفات',
    };
    const accountDistribution: { label: string; value: number }[] = [];
    const byType = new Map<string, number>();
    for (const acc of erpStore.accounts) {
      if (acc.isParent) continue;
      byType.set(acc.type, (byType.get(acc.type) || 0) + 1);
    }
    byType.forEach((count, type) => {
      accountDistribution.push({ label: typeNamesAr[type] || type, value: count });
    });

    return {
      generatedAt: new Date().toISOString(),
      balanceSummary: {
        totalAssets: Math.round(totalAssets),
        totalLiabilities: Math.round(totalLiabilities),
        totalEquity: Math.round(totalEquity),
        totalRevenue: Math.round(totalRevenue),
        totalExpenses: Math.round(totalExpenses),
        netSurplus: Math.round((ie?.netSurplusOrDeficit ?? totalRevenue - totalExpenses) * 100) / 100,
        debtors1301Total: Math.round(debtors1301Total),
        cashPosition: Math.round(cashPosition),
      },
      alerts: {
        pendingApprovals,
        failedOCRDocuments,
        unbalancedEntries,
        highRiskDebtors,
        budgetOverruns,
        lockedUsers,
      },
      charts: {
        expensesTrend,
        revenueByCategory,
        accountDistribution,
      },
    };
  }

  /**
   * فحص الإنذارات وإطلاق التنبيهات التلقائية للإدارة المالية (IMPROVEMENTS 8.2)
   */
  public async runAlertScan(organizationId?: string): Promise<string[]> {
    const summary = await this.getSmartSummary(organizationId);
    const triggered: string[] = [];

    if (summary.alerts.pendingApprovals > 0) {
      triggered.push(`يوجد ${summary.alerts.pendingApprovals} قيد بانتظار الاعتماد`);
      await notificationService.sendFinancialAlert({
        title: 'قيود بانتظار الاعتماد',
        message: `يوجد ${summary.alerts.pendingApprovals} قيد محاسبي بانتظار اعتماد الإدارة المالية بإجمالي يتطلب المراجعة.`,
        severity: 'WARNING',
        targetRole: 'CHIEF_FINANCIAL_OFFICER',
        actionTab: 'journals',
      });
    }

    if (summary.alerts.failedOCRDocuments > 0) {
      triggered.push(`${summary.alerts.failedOCRDocuments} مستند فشل استخراج بياناته`);
      await notificationService.sendFinancialAlert({
        title: 'فشل معالجة مستندات OCR',
        message: `فشل استخراج البيانات من ${summary.alerts.failedOCRDocuments} مستند. يرجى مراجعة جودة الصور أو الإدخال اليدوي.`,
        severity: 'INFO',
        targetRole: 'GENERAL_ACCOUNTANT',
        actionTab: 'ai',
      });
    }

    if (summary.alerts.highRiskDebtors > 0) {
      triggered.push(`${summary.alerts.highRiskDebtors} مدين تجاوز الحد الآمن في 1301`);
      await notificationService.sendFinancialAlert({
        title: 'مديونيات مرتفعة في حساب 1301',
        message: `${summary.alerts.highRiskDebtors} حساب أستاذ مساعد تجاوز الحد الائتماني الآمن (${DEBTOR_ALERT_THRESHOLD.toLocaleString()} ج.م). يُوصى بإصدار إشعارات مطالبة.`,
        severity: 'CRITICAL',
        targetRole: 'CHIEF_FINANCIAL_OFFICER',
        actionTab: 'subledgers',
      });
    }

    if (summary.alerts.unbalancedEntries > 0) {
      triggered.push(`${summary.alerts.unbalancedEntries} قيد غير متوازن (خلل تكاملي!)`);
    }

    return triggered;
  }
}

export const dashboardService = new DashboardService();
