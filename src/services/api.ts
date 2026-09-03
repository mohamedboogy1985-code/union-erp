import {
  Account,
  AuditLog,
  BankAccount,
  BankTransaction,
  BalanceSheetReport,
  Budget,
  CostCenter,
  FiscalPeriod,
  FixedAsset,
  GeneralLedgerReportItem,
  IncomeExpenseReport,
  JournalEntry,
  Member,
  MembershipCertificate,
  Organization,
  Receipt,
  ReceiptsPaymentsItem,
  RevenueDistributionRule,
  SubledgerParty,
  SubledgerPartyStatement,
  TrialBalanceItem,
  User,
  ActuarialFund,
  ActuarialSimulationParams,
  ActuarialSimulationResult,
  Employee,
  EmployeeAffair,
  EmployeeAffairsSummary,
  EmployeeAdvance,
  PayrollRun,
  AttendanceSettings,
  AttendanceDevice,
  AttendanceRecord,
  AttendanceMonthlySummary,
  BiometricMethod,
  AttendanceStatus,
  CommitteeSummary,
  CommitteesData,
  InsuredMember,
  JournalRow,
  EtaStatus,
  EtaDocumentRecord,
  EtaSubmitResponse,
  EtaDocumentInput,
} from '../types/erp.js';

// المستخدم الافتراضي: مدير البرنامج محمد عبد الله أحمد (جميع الصلاحيات)
// مع حفظ اختيار المستخدم في المتصفح لتذكره بين الجلسات
const DEFAULT_USER_ID = 'usr-mohamed-abdallah';
let currentUserId =
  (typeof localStorage !== 'undefined' && localStorage.getItem('union_current_user')) ||
  DEFAULT_USER_ID;

export function setCurrentUserId(id: string) {
  currentUserId = id;
  try {
    localStorage.setItem('union_current_user', id);
  } catch {
    /* تخزين غير متاح */
  }
}

export function getCurrentUserId(): string {
  return currentUserId;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'حدث خطأ في معالجة الطلب');
  }

  return data as T;
}

export const api = {
  // Auth & Users
  getMe: () => request<User>('/api/auth/me'),
  getUsers: () => request<User[]>('/api/auth/users'),
  switchUser: (userId: string) => request<User>('/api/auth/switch-user', { method: 'POST', body: JSON.stringify({ userId }) }),

  // Multi-Org & Cost Centers
  getOrganizations: () => request<Organization[]>('/api/organizations'),
  getCostCenters: (organizationId?: string) =>
    request<CostCenter[]>(organizationId ? `/api/cost-centers?organizationId=${organizationId}` : '/api/cost-centers'),
  getCommittees: (category?: 'COMPANY' | 'PROFESSIONAL') =>
    request<CommitteeSummary[]>(category ? `/api/committees?category=${category}` : '/api/committees'),
  getCommitteesData: () => request<CommitteesData>('/api/committees-data'),
  getInsuredList: (q?: string) =>
    request<InsuredMember[]>(q ? `/api/insured-list?q=${encodeURIComponent(q)}` : '/api/insured-list'),
  getJournal2024: () => request<JournalRow[]>(`/api/journal-2024`),

  // برنامج المحاسبة 2024 — مركز التدريب
  getTrainingAccounting2024: () => request<any>(`/api/training-accounting-2024`),

  // الميزانية العمومية والحسابات الختامية 2024 — مركز التدريب
  getFinalAccounts2024: () => request<any>(`/api/final-accounts-2024`),

  // Chart of Accounts
  getAccounts: () => request<Account[]>('/api/accounts'),
  createAccount: (data: Partial<Account>) => request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),

  // Subledger Parties (1301 Debtors, Vendors, etc.)
  getSubledgerParties: (params: { accountId?: string; search?: string; type?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.accountId) query.set('accountId', params.accountId);
    if (params.search) query.set('search', params.search);
    if (params.type) query.set('type', params.type);
    return request<SubledgerParty[]>(`/api/subledger-parties?${query.toString()}`);
  },
  createSubledgerParty: (data: any) =>
    request<{ party: SubledgerParty; isNew: boolean; similarPartyWarning?: string }>('/api/subledger-parties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  mergeSubledgerParties: (sourcePartyId: string, targetPartyId: string) =>
    request<{ message: string; target: SubledgerParty; reassignedCount: number }>('/api/subledger-parties/merge', {
      method: 'POST',
      body: JSON.stringify({ sourcePartyId, targetPartyId }),
    }),

  // Fiscal Periods
  getFiscalPeriods: () => request<FiscalPeriod[]>('/api/fiscal-periods'),
  toggleFiscalPeriodStatus: (id: string, status: string) =>
    request<FiscalPeriod>(`/api/fiscal-periods/${id}/toggle-status`, { method: 'POST', body: JSON.stringify({ status }) }),

  // Journal Entries
  getJournalEntries: (params: { organizationId?: string; status?: string; type?: string; journalName?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.organizationId) query.set('organizationId', params.organizationId);
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.journalName) query.set('journalName', params.journalName);
    return request<JournalEntry[]>(`/api/journal-entries?${query.toString()}`);
  },
  createJournalEntry: (data: any) =>
    request<{ entry: JournalEntry; warnings: string[] }>('/api/journal-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  submitJournalEntry: (id: string) => request<JournalEntry>(`/api/journal-entries/${id}/submit`, { method: 'POST' }),
  approveJournalEntry: (id: string) => request<JournalEntry>(`/api/journal-entries/${id}/approve`, { method: 'POST' }),
  postJournalEntry: (id: string) => request<JournalEntry>(`/api/journal-entries/${id}/post`, { method: 'POST' }),
  reverseJournalEntry: (id: string, reason: string) =>
    request<{ original: JournalEntry; reversal: JournalEntry }>(`/api/journal-entries/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Reports
  getGeneralLedger: (params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<GeneralLedgerReportItem[]>(`/api/reports/general-ledger?${query.toString()}`);
  },
  getSubledgerStatement: (partyId: string, params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<SubledgerPartyStatement>(`/api/reports/subledger/${partyId}?${query.toString()}`);
  },
  getReceiptsPayments: (params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<{ items: ReceiptsPaymentsItem[]; totalReceipts: number; totalPayments: number; netCashFlow: number }>(
      `/api/reports/receipts-payments?${query.toString()}`
    );
  },
  getIncomeExpense: (params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<IncomeExpenseReport>(`/api/reports/income-expense?${query.toString()}`);
  },
  getTrialBalance: (params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<{
      items: TrialBalanceItem[];
      totals: { periodDebit: number; periodCredit: number; closingDebit: number; closingCredit: number };
    }>(`/api/reports/trial-balance?${query.toString()}`);
  },
  getBalanceSheet: (params: any = {}) => {
    const query = new URLSearchParams(params);
    return request<BalanceSheetReport>(`/api/reports/balance-sheet?${query.toString()}`);
  },

  // Receipts & Distribution
  getReceipts: () => request<Receipt[]>('/api/receipts'),
  createReceipt: (data: any) =>
    request<{ receipt: Receipt; journalEntryId?: string }>('/api/receipts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDistributionRules: () => request<RevenueDistributionRule[]>('/api/revenue-distribution-rules'),
  createDistributionRule: (data: any) =>
    request<RevenueDistributionRule>('/api/revenue-distribution-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  verifyReceipt: (token: string) => request<any>(`/api/verify-receipt/${token}`),

  // Members & Certificates
  getMembers: () => request<Member[]>('/api/members'),
  createMember: (data: any) => request<Member>('/api/members', { method: 'POST', body: JSON.stringify(data) }),
  issueCertificate: (memberId: string) =>
    request<MembershipCertificate>('/api/membership-certificates', { method: 'POST', body: JSON.stringify({ memberId }) }),
  getCertificates: () => request<MembershipCertificate[]>('/api/membership-certificates'),

  // Banking, Budgets, Assets & Audit
  getBankAccounts: () => request<BankAccount[]>('/api/bank-accounts'),
  getBankTransactions: () => request<BankTransaction[]>('/api/bank-transactions'),
  getBudgets: () => request<Budget[]>('/api/budgets'),
  createBudget: (payload: { year: number; title?: string; lines: { accountId: string; allocatedAmount: number }[] }) =>
    request<Budget>('/api/budgets', { method: 'POST', body: JSON.stringify(payload) }),
  updateBudgetStatus: (id: string, status: 'DRAFT' | 'APPROVED' | 'LOCKED') =>
    request<Budget>(`/api/budgets/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  refreshBudgetActuals: (id: string) =>
    request<Budget>(`/api/budgets/${id}/refresh`, { method: 'POST' }),
  getFixedAssets: () => request<FixedAsset[]>('/api/fixed-assets'),
  getAuditLogs: () => request<AuditLog[]>('/api/audit-logs'),
  getRegulation: () =>
    request<{
      document: string;
      articles: {
        articleNo: string;
        title: string;
        text: string;
        category: string;
        keywords: string[];
      }[];
      status: {
        articlesCount: number;
        activeRules: {
          ruleId: string;
          descriptionAr: string;
          value: number | string | null;
          articleNo: string | null;
          enabled: boolean;
          severity: 'BLOCK' | 'WARN';
        }[];
        pendingRules: {
          ruleId: string;
          descriptionAr: string;
          value: number | string | null;
          articleNo: string | null;
          enabled: boolean;
          severity: 'BLOCK' | 'WARN';
        }[];
        isEnforcing: boolean;
      };
    }>('/api/regulation'),

  // استرجاع لائحة النظام الأساسي المؤرشفة من قاعدة البيانات
  getRegulationDocument: () =>
    request<any>('/api/regulation/document'),

  // AI Copilot & Intelligent Features
  queryAI: (prompt: string, organizationId?: string) =>
    request<{ answer: string; suggestedAction?: any; confidence?: number; sources?: { type?: string; reference?: string }[] }>('/api/ai/query', {
      method: 'POST',
      body: JSON.stringify({ prompt, organizationId }),
    }),
  askAccountantExpert: (
    message: string,
    history?: { role: string; text: string }[],
    organizationId?: string
  ) =>
    request<{ answer: string; confidence?: number; sources?: { type?: string; reference?: string }[] }>('/api/ai/accountant-chat', {
      method: 'POST',
      body: JSON.stringify({ message, history, organizationId }),
    }),
  suggestJournalAI: (data: { rawText?: string; imageBase64?: string; mimeType?: string }) =>
    request<any>('/api/ai/suggest-journal', { method: 'POST', body: JSON.stringify(data) }),
  getAnomaliesAI: () => request<any[]>('/api/ai/anomalies'),
  parseVoiceDictationAI: (spokenText: string) =>
    request<any>('/api/ai/voice-dictation', { method: 'POST', body: JSON.stringify({ spokenText }) }),
  getFinancialForecastAI: (horizon: number = 12) =>
    request<any>(`/api/ai/financial-forecast?horizon=${horizon}`),

  // تصدير تقرير المخاطر المالية بصيغة Excel (منسّق، وضعية موحدة)
  downloadFinancialRiskReport: async (): Promise<void> => {
    const res = await fetch('/api/reports/export/risk', {
      headers: { 'x-user-id': currentUserId },
    });
    if (!res.ok) {
      let message = 'تعذر تجهيز ملف التقرير المالي';
      try {
        const body = await res.json();
        message = body.error || message;
      } catch {
        /* تجاهل */
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Union_Financial_Risk_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Document Management System (DMS) & Digital Signatures
  getDocuments: (params: { entityType?: string; entityId?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.entityType) query.set('entityType', params.entityType);
    if (params.entityId) query.set('entityId', params.entityId);
    return request<any[]>(`/api/documents?${query.toString()}`);
  },
  uploadDocument: (data: any) =>
    request<any>('/api/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  signDocument: (id: string, notes?: string) =>
    request<any>(`/api/documents/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  verifyDocument: (id: string) => request<any>(`/api/documents/${id}/verify`),

  // Real-time Notifications
  getNotifications: () => request<any[]>('/api/notifications'),
  markNotificationRead: (id: string) => request<any>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<any>('/api/notifications/mark-all-read', { method: 'POST' }),

  // Advanced Import / Export Engine
  validateImport: (entityType: string, rows: any[]) =>
    request<any>('/api/import/validate', {
      method: 'POST',
      body: JSON.stringify({ entityType, rows }),
    }),
  executeImport: (entityType: string, rows: any[]) =>
    request<any>('/api/import/execute', {
      method: 'POST',
      body: JSON.stringify({ entityType, rows }),
    }),

  // Real Data CSV Import (شاشات دليل الحسابات وقيود اليومية)
  importChartOfAccountsCsv: (csvText: string) =>
    request<any>('/api/import/chart-of-accounts-csv', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    }),
  importJournalEntriesCsv: (csvText: string) =>
    request<any>('/api/import/journal-entries-csv', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    }),

  // Cloud SQL Database & Migrations
  getDatabaseStats: () => request<any>('/api/database/stats'),
  verifyDatabaseSchema: () => request<any>('/api/database/verify-schema', { method: 'POST' }),
  executeSqlMigration: (sql: string) =>
    request<any>('/api/database/execute-migration', {
      method: 'POST',
      body: JSON.stringify({ sql }),
    }),

  // Actuarial Studio & Pension Funds (الدراسات الإكتوارية وصناديق المعاشات)
  getActuarialFunds: () => request<ActuarialFund[]>('/api/actuarial/funds'),
  createActuarialFund: (data: Partial<ActuarialFund>) =>
    request<ActuarialFund>('/api/actuarial/funds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateActuarialFund: (id: string, data: Partial<ActuarialFund>) =>
    request<{ success: boolean; message: string }>(`/api/actuarial/funds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  simulateActuarialProjections: (params: Partial<ActuarialSimulationParams>) =>
    request<ActuarialSimulationResult>('/api/actuarial/simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Employee Affairs (شئون العاملين — استمارة 2 تأمينات + الشئون الإدارية + السلف)
  getEmployees: (search?: string) =>
    request<Employee[]>(search ? `/api/employees?search=${encodeURIComponent(search)}` : '/api/employees'),
  getEmployeeAffairsSummary: () => request<EmployeeAffairsSummary>('/api/employee-affairs/summary'),
  getEmployeeAffairs: (params: { employeeId?: string; type?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.employeeId) query.set('employeeId', params.employeeId);
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    return request<EmployeeAffair[]>(`/api/employee-affairs?${query.toString()}`);
  },
  createEmployeeAffair: (data: any) =>
    request<EmployeeAffair>('/api/employee-affairs', { method: 'POST', body: JSON.stringify(data) }),
  decideEmployeeAffair: (id: string, status: 'APPROVED' | 'REJECTED') =>
    request<EmployeeAffair>(`/api/employee-affairs/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  deleteEmployeeAffair: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/employee-affairs/${id}`, { method: 'DELETE' }),
  getEmployeeAdvances: (employeeId?: string) =>
    request<EmployeeAdvance[]>(employeeId ? `/api/employee-advances?employeeId=${employeeId}` : '/api/employee-advances'),
  createEmployeeAdvance: (data: any) =>
    request<EmployeeAdvance>('/api/employee-advances', { method: 'POST', body: JSON.stringify(data) }),
  payEmployeeAdvanceInstallment: (id: string, payment: { amount: number; date: string; method?: string; notes?: string }) =>
    request<EmployeeAdvance>(`/api/employee-advances/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment),
    }),
  deleteEmployeeAdvance: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/employee-advances/${id}`, { method: 'DELETE' }),

  // Payroll (شاشة المرتبات — مسير الرواتب الشهري)
  getPayrollRuns: () => request<PayrollRun[]>('/api/payroll/runs'),
  getPayrollImportedMonths: () => request<any[]>('/api/payroll/imported-months'),
  getPayrollImportedMonth: (id: string) => request<any>(`/api/payroll/imported-months/${id}`),
  getPayrollRun: (id: string) => request<PayrollRun>(`/api/payroll/runs/${id}`),
  generatePayrollRun: (data: { year: number; month: number; notes?: string; useAttendance?: boolean }) =>
    request<PayrollRun>('/api/payroll/runs', { method: 'POST', body: JSON.stringify(data) }),
  approvePayrollRun: (id: string) =>
    request<PayrollRun>(`/api/payroll/runs/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  postPayrollRun: (id: string) =>
    request<{ run: PayrollRun; entry: JournalEntry }>(`/api/payroll/runs/${id}/post`, { method: 'POST', body: JSON.stringify({}) }),
  deletePayrollRun: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/payroll/runs/${id}`, { method: 'DELETE' }),

  // استيراد أرشيف كشوف المرتبات ZIP/Excel
  importPayrollZipPreview: (fileBase64: string) =>
    request<any>('/api/payroll/import-zip', { method: 'POST', body: JSON.stringify({ fileBase64 }) }),
  commitPayrollImport: (months: any[], year: number) =>
    request<any>('/api/payroll/import-commit', { method: 'POST', body: JSON.stringify({ months, year }) }),

  // Attendance & Biometric Punch (الحضور والانصراف بالبصمة — وجه/إصبع)
  getAttendanceSettings: () => request<AttendanceSettings>('/api/attendance/settings'),
  updateAttendanceSettings: (data: Partial<AttendanceSettings>) =>
    request<AttendanceSettings>('/api/attendance/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getAttendanceDevices: () => request<AttendanceDevice[]>('/api/attendance/devices'),
  addAttendanceDevice: (data: { name: string; type: AttendanceDevice['type']; location: string }) =>
    request<AttendanceDevice>('/api/attendance/devices', { method: 'POST', body: JSON.stringify(data) }),
  getAttendanceRecords: (params: { employeeId?: string; date?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.employeeId) qs.set('employeeId', params.employeeId);
    if (params.date) qs.set('date', params.date);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const q = qs.toString();
    return request<AttendanceRecord[]>(`/api/attendance${q ? `?${q}` : ''}`);
  },
  punchAttendance: (data: {
    employeeId?: string;
    employeeCode?: string;
    method?: BiometricMethod;
    direction?: 'IN' | 'OUT';
    timestamp?: string;
    deviceId?: string;
    verificationScore?: number;
    notes?: string;
  }) =>
    request<{ record: AttendanceRecord; direction: 'IN' | 'OUT'; message: string }>('/api/attendance/punch', { method: 'POST', body: JSON.stringify(data) }),
  importAttendanceRows: (rows: { employeeCode: string; date: string; checkIn: string; checkOut?: string; method?: BiometricMethod; deviceId?: string }[]) =>
    request<{ imported: number; skipped: number; errors: { row: number; message: string }[] }>('/api/attendance/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  setAttendanceDayStatus: (data: { employeeId: string; date: string; status: AttendanceStatus; notes?: string }) =>
    request<AttendanceRecord>('/api/attendance/day-status', { method: 'POST', body: JSON.stringify(data) }),
  updateAttendanceRecord: (id: string, patch: Partial<AttendanceRecord>) =>
    request<AttendanceRecord>(`/api/attendance/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteAttendanceRecord: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/attendance/${id}`, { method: 'DELETE' }),
  getAttendanceMonthSummaries: (year: number, month: number) =>
    request<AttendanceMonthlySummary[]>(`/api/attendance/monthly/${year}/${month}`),
  getAttendanceEmployeeSummary: (year: number, month: number, employeeId: string) =>
    request<AttendanceMonthlySummary>(`/api/attendance/monthly/${year}/${month}/${employeeId}`),

  // ─── منظومة الفاتورة الإلكترونية (ETA) — مصلحة الضرائب المصرية ───
  etaGetStatus: () => request<EtaStatus>(`/api/eta/status`),
  etaListDocuments: () => request<EtaDocumentRecord[]>(`/api/eta/documents`),
  etaSubmit: (document: EtaDocumentInput) =>
    request<EtaSubmitResponse>('/api/eta/submit', { method: 'POST', body: JSON.stringify({ document }) }),
  etaSubmitFromReceipt: (id: string, data?: any) =>
    request<EtaSubmitResponse>(`/api/eta/submit/receipt/${id}`, { method: 'POST', body: JSON.stringify(data || {}) }),
  etaSubmitFromJournal: (id: string, data?: any) =>
    request<EtaSubmitResponse>(`/api/eta/submit/journal/${id}`, { method: 'POST', body: JSON.stringify(data || {}) }),
  etaQuerySubmission: (submissionId: string) => request<any>(`/api/eta/submissions/${submissionId}`),
  etaVerify: (uuid: string) => request<any>(`/api/eta/documents/${uuid}/verify`, { method: 'POST' }),
  etaCancel: (uuid: string, reason: string) =>
    request<any>(`/api/eta/documents/${uuid}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  etaDownloadUrl: (uuid: string) => `/api/eta/documents/${uuid}/download`,
};

