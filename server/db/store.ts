import {
  Account,
  AccountingHistoryRecord,
  AppNotification,
  AttendanceDevice,
  AttendanceRecord,
  AttendanceSettings,
  AuditLog,
  BankAccount,
  BankTransaction,
  Budget,
  CostCenter,
  DigitalSignature,
  DocumentAttachment,
  FiscalPeriod,
  FixedAsset,
  JournalEntry,
  JournalEntryLine,
  JournalTemplate,
  Member,
  MembershipCertificate,
  OCRProcessingRecord,
  Organization,
  Receipt,
  RevenueDistributionRule,
  SubledgerAlias,
  SubledgerParty,
  User,
  UserSecurityState,
  Vendor,
  Employee,
  EmployeeAffair,
  EmployeeAdvance,
  PayrollRun,
} from '../../src/types/erp.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { calculateAuditHash, generateVerificationToken, hashNationalId, maskIban, maskNationalId, sha256 } from '../utils/crypto.js';

export class ERPStore {
  public organizations: Organization[] = [];
  public costCenters: CostCenter[] = [];
  public users: User[] = [];
  public accounts: Account[] = [];
  public subledgerParties: SubledgerParty[] = [];
  public subledgerAliases: SubledgerAlias[] = [];
  public fiscalPeriods: FiscalPeriod[] = [];
  public journalEntries: JournalEntry[] = [];
  public members: Member[] = [];
  public certificates: MembershipCertificate[] = [];
  public receipts: Receipt[] = [];
  public distributionRules: RevenueDistributionRule[] = [];
  public bankAccounts: BankAccount[] = [];
  public bankTransactions: BankTransaction[] = [];
  public budgets: Budget[] = [];
  public vendors: Vendor[] = [];
  public assets: FixedAsset[] = [];
  public auditLogs: AuditLog[] = [];
  public attachments: DocumentAttachment[] = [];
  public notifications: AppNotification[] = [];

  // ===== IMPROVEMENTS.md Collections =====
  public accountingHistory: AccountingHistoryRecord[] = [];
  public journalTemplates: JournalTemplate[] = [];
  public ocrProcessingRecords: OCRProcessingRecord[] = [];
  public userSecurity: Map<string, UserSecurityState> = new Map();
  public supportFeedback: { ticketId: string; rating: number; comment?: string; createdAt: string }[] = [];

  public accountIndex: Map<string, Account> = new Map();
  public accountCodeIndex: Map<string, Account> = new Map();
  public subledgerByAccountIndex: Map<string, SubledgerParty[]> = new Map();
  // ===== شئون العاملين (استكمال وحدة شئون العاملين) =====
  public employees: Employee[] = [];
  public employeeAffairs: EmployeeAffair[] = [];
  public employeeAdvances: EmployeeAdvance[] = [];
  // ===== شاشة المرتبات (مسير الرواتب الشهري) =====
  public payrollRuns: PayrollRun[] = [];
  // ===== كشوف المرتبات المستوردة من أرشيف Excel (نماذج معتمدة) =====
  public payrollImports: any[] = [];
  // ===== الحضور والانصراف بالبصمة (وجه/إصبع) =====
  public attendanceRecords: AttendanceRecord[] = [];
  public attendanceDevices: AttendanceDevice[] = [];
  public attendanceSettings: AttendanceSettings = {
    shiftStart: '09:00',
    shiftMinutes: 8 * 60,
    graceMinutes: 15,
    weekendDays: [5, 6], // الجمعة والسبت
    daySalaryDivisor: 30,
    payOvertime: false,
    overtimeRate: 1.0,
  };

  private lastAuditHash = '0000000000000000000000000000000000000000000000000000000000000000';

  constructor() {
    this.seedInitialData();
    this.rebuildAccountIndexes();
  }

  public rebuildAccountIndexes() {
    this.accountIndex = new Map();
    this.accountCodeIndex = new Map();
    this.subledgerByAccountIndex = new Map();

    for (const account of this.accounts) {
      if (account.id && !this.accountIndex.has(account.id)) {
        this.accountIndex.set(account.id, account);
      }
      if (account.code && !this.accountCodeIndex.has(account.code)) {
        this.accountCodeIndex.set(account.code, account);
      }
    }

    for (const party of this.subledgerParties) {
      if (!party.associatedAccountId) continue;
      const list = this.subledgerByAccountIndex.get(party.associatedAccountId) || [];
      list.push(party);
      this.subledgerByAccountIndex.set(party.associatedAccountId, list);
    }
  }

  public getAccountById(id: string): Account | undefined {
    if (this.accountIndex.size !== this.accounts.length) this.rebuildAccountIndexes();
    return this.accountIndex.get(id);
  }

  public getAccountByCode(code: string): Account | undefined {
    if (this.accountCodeIndex.size !== this.accounts.length) this.rebuildAccountIndexes();
    return this.accountCodeIndex.get(code);
  }

  public getSubledgerPartiesForAccount(accountId: string): SubledgerParty[] {
    if (this.subledgerByAccountIndex.size !== this.subledgerParties.length) this.rebuildAccountIndexes();
    return this.subledgerByAccountIndex.get(accountId) || [];
  }

  public addNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>): AppNotification {
    const item: AppNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    this.notifications.unshift(item);
    return item;
  }

  public recordAudit(
    userId: string,
    userName: string,
    userRole: string,
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: string,
    previousState?: any,
    newState?: any,
    status: 'SUCCESS' | 'FAILURE' | 'BLOCKED' = 'SUCCESS'
  ): AuditLog {
    const timestamp = new Date().toISOString();
    const correlationId = `CORR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const eventHash = calculateAuditHash(timestamp, userId, action, entityId, this.lastAuditHash);

    const log: AuditLog = {
      id: `AUDIT-${Date.now()}-${this.auditLogs.length + 1}`,
      timestamp,
      userId,
      userName,
      userRole,
      organizationId,
      ipAddress: '127.0.0.1 (Desktop Client)',
      action,
      entityType,
      entityId,
      details,
      previousState,
      newState,
      status,
      correlationId,
      previousHash: this.lastAuditHash,
      eventHash,
    };

    this.lastAuditHash = eventHash;
    this.auditLogs.unshift(log);
    return log;
  }

  private seedInitialData() {
    // 1. Organizations
    this.organizations = [
      {
        id: 'org-general',
        code: 'ORG-01',
        name: 'النقابة العامة',
        nameEn: 'General Syndicate',
        type: 'GENERAL_UNION',
        taxNumber: '100-200-300',
        address: 'شارع رمسيس - القاهرة',
        phone: '02-25789000',
        email: 'info@union-erp.gov.eg',
        isActive: true,
        currency: 'EGP',
      },
      {
        id: 'org-eng-committee',
        code: 'ORG-02',
        name: 'اللجنة النقابية للمهندسين',
        nameEn: 'Engineers Professional Committee',
        type: 'PROFESSIONAL_COMMITTEE',
        parentId: 'org-general',
        address: 'مجمع النقابات - مدينة نصر',
        phone: '02-24012345',
        email: 'eng.committee@union-erp.gov.eg',
        isActive: true,
        currency: 'EGP',
      },
      {
        id: 'org-petro-committee',
        code: 'ORG-03',
        name: 'اللجنة النقابية لشركة البترول',
        nameEn: 'Petroleum Company Committee',
        type: 'COMPANY_COMMITTEE',
        parentId: 'org-general',
        address: 'المقر الإداري - السويس',
        phone: '062-3345678',
        email: 'petro.committee@union-erp.gov.eg',
        isActive: true,
        currency: 'EGP',
      },
      {
        id: 'org-takaful-fund',
        code: 'ORG-04',
        name: 'صندوق التكافل والرعاية الصحية',
        nameEn: 'Healthcare & Solidarity Fund',
        type: 'FUND',
        parentId: 'org-general',
        isActive: true,
        currency: 'EGP',
      },
    ];

    // 2. Cost Centers
    this.costCenters = [
      { id: 'cc-admin', code: 'CC-101', name: 'الإدارة العامة والشؤون المالية', organizationId: 'org-general', isActive: true },
      { id: 'cc-membership', code: 'CC-102', name: 'شؤون العضوية والاشتراكات', organizationId: 'org-general', isActive: true },
      { id: 'cc-services', code: 'CC-103', name: 'الخدمات الاجتماعية والأنشطة', organizationId: 'org-general', isActive: true },
      { id: 'cc-training', code: 'CC-104', name: 'مركز التدريب والتطوير المهني', organizationId: 'org-eng-committee', isActive: true },
    ];

    // 3. Users with RBAC
    this.users = [
      {
        id: 'usr-admin',
        username: 'admin',
        fullName: 'المهندس أحمد مصطفى (مدير النظام)',
        email: 'admin@union-erp.org',
        role: 'SYSTEM_ADMIN',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee', 'org-takaful-fund'],
        isActive: true,
        maxApprovalLimit: 10000000,
        isDemo: true
      },
      {
        id: 'usr-cfo',
        username: 'cfo',
        fullName: 'أ.د. طارق الجمال (المدير المالي العام)',
        email: 'cfo@union-erp.org',
        role: 'CHIEF_FINANCIAL_OFFICER',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee', 'org-takaful-fund'],
        isActive: true,
        maxApprovalLimit: 5000000,
        isDemo: true
      },
      {
        id: 'usr-accountant',
        username: 'accountant',
        fullName: 'أ. محمود السعدني (محاسب أول النقابة)',
        email: 'm.saadany@union-erp.org',
        role: 'GENERAL_ACCOUNTANT',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general'],
        isActive: true,
        maxApprovalLimit: 250000,
        isDemo: true
      },
      {
        id: 'usr-collector',
        username: 'collector',
        fullName: 'أ. سمير عبد الله (مسؤول التحصيل والخزينة)',
        email: 's.abdullah@union-erp.org',
        role: 'COLLECTION_OFFICER',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general'],
        isActive: true,
        maxApprovalLimit: 50000,
        isDemo: true
      },
      {
        id: 'usr-auditor',
        username: 'auditor',
        fullName: 'أ. حسن البنا (مدقق داخلي معتمد)',
        email: 'auditor@union-erp.org',
        role: 'INTERNAL_AUDITOR',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee'],
        isActive: true,
        maxApprovalLimit: 0,
        isDemo: true
      },
    ];

    // ===== 3b. المستخدمون الفعليون المعتمدون (صلاحيات محددة من إدارة النقابة) =====
    const realUsers: User[] = [
      {
        id: 'usr-mohamed-abdallah',
        username: 'mohamed.abdallah',
        fullName: 'محمد عبد الله أحمد',
        email: 'm.abdallah@union-erp.org',
        role: 'PROGRAM_MANAGER',
        roleLabelAr: 'مدير البرنامج — جميع الصلاحيات',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee', 'org-takaful-fund'],
        isActive: true,
        maxApprovalLimit: 10000000,
        permissions: ['*'],
        avatarUrl: '/assets/avatars/mohamed-abdallah.png?v=2',
      },
      {
        id: 'usr-mohamed-abdelrasoul',
        username: 'mohamed.abdelrasoul',
        fullName: 'محمد محمد عبد الرسول',
        email: 'm.abdelrasoul@union-erp.org',
        role: 'JOURNAL_ACCOUNTANT',
        roleLabelAr: 'محاسب — تسجيل بشاشة اليومية فقط',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general'],
        isActive: true,
        maxApprovalLimit: 0,
        permissions: ['view:all', 'search:all', 'print:all', 'journal:create'],
        avatarUrl: '/assets/avatars/mohamed-abdelrasoul.png?v=2',
      },
      {
        id: 'usr-hisham-mostafa',
        username: 'hisham.mostafa',
        fullName: 'هشام مصطفى محمد',
        email: 'h.mostafa@union-erp.org',
        role: 'HEAD_OF_ACCOUNTS',
        roleLabelAr: 'رئيس الحسابات — اطلاع وبحث وطباعة',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee'],
        isActive: true,
        maxApprovalLimit: 0,
        permissions: ['view:all', 'search:all', 'print:all'],
        avatarUrl: '/assets/avatars/hisham-mostafa.png?v=2',
      },
      {
        id: 'usr-abdelmoneim-gamal',
        username: 'abdelmoneim.gamal',
        fullName: 'عبد المنعم الجمل',
        email: 'a.gamal@union-erp.org',
        role: 'PRESIDENT',
        roleLabelAr: 'رئيس النقابة العامة — اطلاع وبحث وطباعة',
        organizationId: 'org-general',
        allowedOrgIds: ['org-general', 'org-eng-committee', 'org-petro-committee', 'org-takaful-fund'],
        isActive: true,
        maxApprovalLimit: 0,
        permissions: ['view:all', 'search:all', 'print:all'],
        avatarUrl: '/assets/avatars/abdelmoneim-gamal.png?v=2',
      },
    ];
    this.users.push(...realUsers);

    // 4. Chart of Accounts (دليل الحسابات المتوافق مع معايير المحاسبة والأنظمة النقابية)
    this.accounts = [
      // Assets
      { id: 'acc-1', code: '1', name: 'الأصول', type: 'ASSET', nature: 'DEBIT', isParent: true, level: 1, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 3280000, isActive: true },
      { id: 'acc-11', code: '11', name: 'الأصول المتداولة - النقدية وما في حكمها', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-1', isParent: true, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 2450000, isActive: true },
      { id: 'acc-1101', code: '1101', name: 'الخزينة الرئيسية بالنقابة العامة', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-11', isParent: false, level: 3, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 350000, isActive: true },
      { id: 'acc-1102', code: '1102', name: 'البنك الأهلي المصري - حساب جاري', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-11', isParent: false, level: 3, requiresSubledger: true, subledgerType: 'BANK', currentBalance: 1200000, isActive: true },
      { id: 'acc-1103', code: '1103', name: 'بنك مصر - حساب التحصيلات الإلكترونية', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-11', isParent: false, level: 3, requiresSubledger: true, subledgerType: 'BANK', currentBalance: 900000, isActive: true },
      { id: 'acc-13', code: '13', name: 'المدينون والحسابات المدينة الأخرى', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-1', isParent: true, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 480000, isActive: true },
      // The Crucial Account: 1301 - مدينون متنوعون (Mandatory subledger requirement!)
      { id: 'acc-1301', code: '1301', name: 'مدينون متنوعون', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-13', isParent: false, level: 3, requiresSubledger: true, subledgerType: 'MISC_DEBTOR', currentBalance: 480000, isActive: true },
      { id: 'acc-14', code: '14', name: 'الأصول الثابتة', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-1', isParent: true, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 350000, isActive: true },
      { id: 'acc-1401', code: '1401', name: 'أجهزة حاسب آلي ومعدات تقنية', type: 'ASSET', nature: 'DEBIT', parentId: 'acc-14', isParent: false, level: 3, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 350000, isActive: true },

      // Liabilities & Equity
      { id: 'acc-2', code: '2', name: 'الالتزامات', type: 'LIABILITY', nature: 'CREDIT', isParent: true, level: 1, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 280000, isActive: true },
      { id: 'acc-21', code: '21', name: 'الالتزامات المتداولة', type: 'LIABILITY', nature: 'CREDIT', parentId: 'acc-2', isParent: true, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 280000, isActive: true },
      { id: 'acc-2101', code: '2101', name: 'دائنون متنوعون وموردون', type: 'LIABILITY', nature: 'CREDIT', parentId: 'acc-21', isParent: false, level: 3, requiresSubledger: true, subledgerType: 'VENDOR', currentBalance: 190000, isActive: true },
      { id: 'acc-2102', code: '2102', name: 'أمانات ومستحقات لجان فرعية', type: 'LIABILITY', nature: 'CREDIT', parentId: 'acc-21', isParent: false, level: 3, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 90000, isActive: true },

      // Equity / Capital Fund
      { id: 'acc-3', code: '3', name: 'حقوق الملكية والاحتياطيات النقابية', type: 'EQUITY', nature: 'CREDIT', isParent: true, level: 1, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 3000000, isActive: true },
      { id: 'acc-3101', code: '3101', name: 'الاحتياطي العام وصندوق النقابة', type: 'EQUITY', nature: 'CREDIT', parentId: 'acc-3', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 2500000, isActive: true },
      { id: 'acc-3102', code: '3102', name: 'الفائض المتراكم للسنوات السابقة', type: 'EQUITY', nature: 'CREDIT', parentId: 'acc-3', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 500000, isActive: true },

      // Revenues
      { id: 'acc-4', code: '4', name: 'الإيرادات والمقبوضات', type: 'REVENUE', nature: 'CREDIT', isParent: true, level: 1, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 1250000, isActive: true },
      { id: 'acc-4101', code: '4101', name: 'إيراد اشتراكات العضوية السنوية', type: 'REVENUE', nature: 'CREDIT', parentId: 'acc-4', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 650000, isActive: true },
      { id: 'acc-4102', code: '4102', name: 'إيراد رسوم إصدار وتجديد الشهادات', type: 'REVENUE', nature: 'CREDIT', parentId: 'acc-4', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 320000, isActive: true },
      { id: 'acc-4103', code: '4103', name: 'حصيلة توريدات اللجان المهنية ولجان الشركات', type: 'REVENUE', nature: 'CREDIT', parentId: 'acc-4', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 280000, isActive: true },

      // Expenses
      { id: 'acc-5', code: '5', name: 'المصروفات والمدفوعات', type: 'EXPENSE', nature: 'DEBIT', isParent: true, level: 1, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 420000, isActive: true },
      { id: 'acc-5101', code: '5101', name: 'مصروفات عمومية وإدارية', type: 'EXPENSE', nature: 'DEBIT', parentId: 'acc-5', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 180000, isActive: true },
      { id: 'acc-5102', code: '5102', name: 'مصروفات دعم ورعاية الأعضاء', type: 'EXPENSE', nature: 'DEBIT', parentId: 'acc-5', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 150000, isActive: true },
      { id: 'acc-5103', code: '5103', name: 'مصروفات مؤتمرات وتدريب نقابي', type: 'EXPENSE', nature: 'DEBIT', parentId: 'acc-5', isParent: false, level: 2, requiresSubledger: false, subledgerType: 'NONE', currentBalance: 90000, isActive: true },
    ];

    // 5. Seed Subledger Parties (خصوصاً لحساب 1301 مدينون متنوعون)
    this.subledgerParties = [
      {
        id: 'party-101',
        partyCode: 'DEBT-101',
        name: 'شركة الأمل للمقاولات والتطوير',
        normalizedName: normalizeArabicText('شركة الأمل للمقاولات والتطوير'),
        type: 'MISC_DEBTOR',
        taxNumber: '400-500-600',
        phone: '01001234567',
        organizationId: 'org-general',
        associatedAccountId: 'acc-1301',
        totalDebit: 320000,
        totalCredit: 120000,
        currentBalance: 200000,
        createdAt: '2026-01-05T09:00:00Z',
        updatedAt: '2026-02-10T14:30:00Z',
      },
      {
        id: 'party-102',
        partyCode: 'DEBT-102',
        name: 'د. أحمد سامي إبراهيم',
        normalizedName: normalizeArabicText('د. أحمد سامي إبراهيم'),
        type: 'MISC_DEBTOR',
        phone: '01122334455',
        organizationId: 'org-general',
        associatedAccountId: 'acc-1301',
        totalDebit: 180000,
        totalCredit: 30000,
        currentBalance: 150000,
        createdAt: '2026-01-10T11:00:00Z',
        updatedAt: '2026-02-15T12:00:00Z',
      },
      {
        id: 'party-103',
        partyCode: 'DEBT-103',
        name: 'مؤسسة النور الهندسية للاستشارات',
        normalizedName: normalizeArabicText('مؤسسة النور الهندسية للاستشارات'),
        type: 'MISC_DEBTOR',
        taxNumber: '700-800-900',
        phone: '01234567890',
        organizationId: 'org-general',
        associatedAccountId: 'acc-1301',
        totalDebit: 130000,
        totalCredit: 0,
        currentBalance: 130000,
        createdAt: '2026-02-01T10:00:00Z',
        updatedAt: '2026-02-18T16:00:00Z',
      },
    ];

    // Aliases
    this.subledgerAliases = [
      { id: 'alias-1', partyId: 'party-101', aliasName: 'الأمل مقاولات', normalizedAlias: normalizeArabicText('الأمل مقاولات') },
      { id: 'alias-2', partyId: 'party-102', aliasName: 'احمد سامي ابراهيم', normalizedAlias: normalizeArabicText('احمد سامي ابراهيم') },
    ];

    // 6. Fiscal Periods for 2026
    this.fiscalPeriods = [
      { id: 'fp-2026-01', year: 2026, periodNumber: 1, name: 'يناير 2026', startDate: '2026-01-01', endDate: '2026-01-31', status: 'CLOSED', closedAt: '2026-02-01T00:00:00Z' },
      { id: 'fp-2026-02', year: 2026, periodNumber: 2, name: 'فبراير 2026', startDate: '2026-02-01', endDate: '2026-02-28', status: 'OPEN' },
      { id: 'fp-2026-03', year: 2026, periodNumber: 3, name: 'مارس 2026', startDate: '2026-03-01', endDate: '2026-03-31', status: 'OPEN' },
    ];

    // 7. Seed Journal Entries (Balanced Entries)
    this.journalEntries = [
      {
        id: 'je-2026-001',
        entryNumber: 'JV-2026-0001',
        date: '2026-01-15',
        organizationId: 'org-general',
        organizationName: 'النقابة العامة',
        fiscalPeriodId: 'fp-2026-01',
        fiscalPeriodName: 'يناير 2026',
        type: 'MANUAL',
        status: 'POSTED',
        description: 'إثبات مديونية مستحقة على شركة الأمل للمقاولات عن إيجار القاعة والمطبوعات',
        totalDebit: 320000,
        totalCredit: 320000,
        createdBy: 'usr-accountant',
        createdByName: 'أ. محمود السعدني',
        submittedBy: 'usr-accountant',
        approvedBy: 'usr-cfo',
        postedBy: 'usr-cfo',
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
        postedAt: '2026-01-15T12:00:00Z',
        lines: [
          {
            id: 'jel-1',
            journalEntryId: 'je-2026-001',
            lineNumber: 1,
            accountId: 'acc-1301',
            accountCode: '1301',
            accountName: 'مدينون متنوعون',
            subledgerPartyId: 'party-101',
            subledgerPartyName: 'شركة الأمل للمقاولات والتطوير',
            costCenterId: 'cc-services',
            costCenterName: 'الخدمات الاجتماعية والأنشطة',
            debit: 320000,
            credit: 0,
            description: 'مديونية إيجار القاعة الكبرى والمؤتمرات',
          },
          {
            id: 'jel-2',
            journalEntryId: 'je-2026-001',
            lineNumber: 2,
            accountId: 'acc-4103',
            accountCode: '4103',
            accountName: 'حصيلة توريدات اللجان المهنية ولجان الشركات',
            costCenterId: 'cc-services',
            costCenterName: 'الخدمات الاجتماعية والأنشطة',
            debit: 0,
            credit: 320000,
            description: 'إيرادات خدمات نقابية وإيجار قاعات',
          },
        ],
      },
      {
        id: 'je-2026-002',
        entryNumber: 'JV-2026-0002',
        date: '2026-02-05',
        organizationId: 'org-general',
        organizationName: 'النقابة العامة',
        fiscalPeriodId: 'fp-2026-02',
        fiscalPeriodName: 'فبراير 2026',
        type: 'RECEIPT',
        status: 'POSTED',
        description: 'تحصيل دفعة نقدية بالخزينة من شركة الأمل للمقاولات لسداد جزء من المديونية',
        totalDebit: 120000,
        totalCredit: 120000,
        createdBy: 'usr-collector',
        createdByName: 'أ. سمير عبد الله',
        submittedBy: 'usr-collector',
        approvedBy: 'usr-cfo',
        postedBy: 'usr-cfo',
        createdAt: '2026-02-05T11:00:00Z',
        updatedAt: '2026-02-05T11:30:00Z',
        postedAt: '2026-02-05T11:30:00Z',
        lines: [
          {
            id: 'jel-3',
            journalEntryId: 'je-2026-002',
            lineNumber: 1,
            accountId: 'acc-1101',
            accountCode: '1101',
            accountName: 'الخزينة الرئيسية بالنقابة العامة',
            debit: 120000,
            credit: 0,
            description: 'إيداع نقدي بالخزينة بموجب إيصال تحصيل',
          },
          {
            id: 'jel-4',
            journalEntryId: 'je-2026-002',
            lineNumber: 2,
            accountId: 'acc-1301',
            accountCode: '1301',
            accountName: 'مدينون متنوعون',
            subledgerPartyId: 'party-101',
            subledgerPartyName: 'شركة الأمل للمقاولات والتطوير',
            debit: 0,
            credit: 120000,
            description: 'سداد جزئي من مديونية إيجار القاعة الكبرى',
          },
        ],
      },
      {
        id: 'je-2026-003',
        entryNumber: 'JV-2026-0003',
        date: '2026-02-12',
        organizationId: 'org-general',
        organizationName: 'النقابة العامة',
        fiscalPeriodId: 'fp-2026-02',
        fiscalPeriodName: 'فبراير 2026',
        type: 'MANUAL',
        status: 'POSTED',
        description: 'إثبات سلفة مؤقتة للمهندس د. أحمد سامي إبراهيم للأبحاث الميدانية',
        totalDebit: 180000,
        totalCredit: 180000,
        createdBy: 'usr-accountant',
        createdByName: 'أ. محمود السعدني',
        approvedBy: 'usr-cfo',
        postedBy: 'usr-cfo',
        createdAt: '2026-02-12T09:30:00Z',
        updatedAt: '2026-02-12T10:00:00Z',
        postedAt: '2026-02-12T10:00:00Z',
        lines: [
          {
            id: 'jel-5',
            journalEntryId: 'je-2026-003',
            lineNumber: 1,
            accountId: 'acc-1301',
            accountCode: '1301',
            accountName: 'مدينون متنوعون',
            subledgerPartyId: 'party-102',
            subledgerPartyName: 'د. أحمد سامي إبراهيم',
            debit: 180000,
            credit: 0,
            description: 'سلفة مؤقتة لدراسات وأبحاث نقابية',
          },
          {
            id: 'jel-6',
            journalEntryId: 'je-2026-003',
            lineNumber: 2,
            accountId: 'acc-1102',
            accountCode: '1102',
            accountName: 'البنك الأهلي المصري - حساب جاري',
            debit: 0,
            credit: 180000,
            description: 'تحويل بنكي صادر برقم شيك 883920',
          },
        ],
      },
    ];

    // 8. Revenue Distribution Rules (قواعد توزيع الإيرادات)
    this.distributionRules = [
      {
        id: 'rule-member-fees',
        ruleCode: 'DIST-MEMB-V1',
        revenueTypeName: 'اشتراكات العضوية السنوية',
        version: 1,
        effectiveFrom: '2026-01-01',
        status: 'ACTIVE',
        lines: [
          { id: 'rl-1', beneficiaryOrgId: 'org-general', beneficiaryOrgName: 'النقابة العامة', percentage: 50, accountId: 'acc-4101' },
          { id: 'rl-2', beneficiaryOrgId: 'org-eng-committee', beneficiaryOrgName: 'اللجنة الفرعية / المهنية', percentage: 30, accountId: 'acc-2102' },
          { id: 'rl-3', beneficiaryOrgId: 'org-takaful-fund', beneficiaryOrgName: 'صندوق التكافل والرعاية الصحية', percentage: 20, accountId: 'acc-2102' },
        ],
      },
      {
        id: 'rule-cert-fees',
        ruleCode: 'DIST-CERT-V1',
        revenueTypeName: 'رسوم إصدار وتجديد الشهادات',
        version: 1,
        effectiveFrom: '2026-01-01',
        status: 'ACTIVE',
        lines: [
          { id: 'rl-4', beneficiaryOrgId: 'org-general', beneficiaryOrgName: 'النقابة العامة (صندوق المعاشات والإدارة)', percentage: 70, accountId: 'acc-4102' },
          { id: 'rl-5', beneficiaryOrgId: 'org-takaful-fund', beneficiaryOrgName: 'صندوق التكافل والرعاية الصحية', percentage: 30, accountId: 'acc-2102' },
        ],
      },
    ];

    // 9. Members & Certificates
    this.members = [
      {
        id: 'mem-1001',
        membershipNumber: 'MEM-2026-00451',
        fullName: 'المهندس ياسر محمد عبد الرحمن',
        nationalIdMasked: maskNationalId('28504151203456'),
        nationalIdHash: hashNationalId('28504151203456'),
        syndicateCommitteeId: 'org-eng-committee',
        syndicateCommitteeName: 'اللجنة النقابية للمهندسين',
        companyName: 'شركة المقاولون العرب',
        profession: 'مهندس استشاري مدني',
        status: 'ACTIVE',
        joinDate: '2015-06-01',
        phone: '01012349988',
        email: 'yasser.rahman@gmail.com',
        lastCertificateExpiry: '2027-01-01',
      },
      {
        id: 'mem-1002',
        membershipNumber: 'MEM-2026-00452',
        fullName: 'المهندسة نادية إبراهيم خليل',
        nationalIdMasked: maskNationalId('29008200109876'),
        nationalIdHash: hashNationalId('29008200109876'),
        syndicateCommitteeId: 'org-petro-committee',
        syndicateCommitteeName: 'اللجنة النقابية لشركة البترول',
        companyName: 'شركة بترول بلاعيم',
        profession: 'مهندس بترول وتكرير',
        status: 'ACTIVE',
        joinDate: '2018-09-15',
        phone: '01155443322',
        email: 'nadia.khalil@petro.com',
        lastCertificateExpiry: '2026-12-31',
      },
    ];

    this.certificates = [
      {
        id: 'cert-101',
        certificateNumber: 'CERT-2026-9081',
        memberId: 'mem-1001',
        memberName: 'المهندس ياسر محمد عبد الرحمن',
        membershipNumber: 'MEM-2026-00451',
        issueDate: '2026-01-05',
        expiryDate: '2027-01-01',
        status: 'VALID',
        verificationToken: generateVerificationToken('CERT'),
      },
    ];

    // 10. Receipts
    this.receipts = [
      {
        id: 'rc-2026-001',
        receiptNumber: 'RC-2026-0010',
        date: '2026-02-05',
        organizationId: 'org-general',
        organizationName: 'النقابة العامة',
        payerName: 'شركة الأمل للمقاولات والتطوير',
        revenueTypeId: 'rule-cert-fees',
        revenueTypeName: 'سداد مستحقات ومديونية سابقة',
        amount: 120000,
        paymentMethod: 'CASH',
        notes: 'إيداع نقدي بالخزينة لسداد دفعة من مديونية إيجار القاعات',
        status: 'APPROVED',
        journalEntryId: 'je-2026-002',
        qrVerificationToken: generateVerificationToken('REC'),
        sha256Hash: sha256('RC-2026-0010:120000:CASH:2026-02-05'),
        createdBy: 'usr-collector',
        approvedBy: 'usr-cfo',
        createdAt: '2026-02-05T11:00:00Z',
        allocations: [
          { id: 'al-1', receiptId: 'rc-2026-001', beneficiaryOrgId: 'org-general', beneficiaryOrgName: 'النقابة العامة', percentage: 100, allocatedAmount: 120000, accountId: 'acc-1301' },
        ],
      },
    ];

    // 11. Bank Accounts & Reconciliation
    this.bankAccounts = [
      {
        id: 'bank-1',
        bankName: 'البنك الأهلي المصري',
        accountNumberMasked: '10029384992019',
        ibanMasked: maskIban('EG1200030010029384992019001'),
        organizationId: 'org-general',
        accountId: 'acc-1102',
        currentBalance: 1200000,
        lastSyncAt: '2026-02-19T10:00:00Z',
      },
      {
        id: 'bank-2',
        bankName: 'بنك مصر',
        accountNumberMasked: '20048172654321',
        ibanMasked: maskIban('EG9900020020048172654321002'),
        organizationId: 'org-general',
        accountId: 'acc-1103',
        currentBalance: 900000,
        lastSyncAt: '2026-02-19T10:00:00Z',
      },
    ];

    this.bankTransactions = [
      {
        id: 'bt-1',
        bankAccountId: 'bank-1',
        transactionDate: '2026-02-12',
        referenceNumber: 'CHK-883920',
        description: 'صرف شيك مسحوب لصالح د. أحمد سامي إبراهيم',
        debit: 0,
        credit: 180000,
        matchedStatus: 'MATCHED',
        matchedJournalEntryId: 'je-2026-003',
      },
      {
        id: 'bt-2',
        bankAccountId: 'bank-1',
        transactionDate: '2026-02-18',
        referenceNumber: 'TX-990123',
        description: 'تحويل إلكتروني وارد من شركة النصر للبترول',
        debit: 150000,
        credit: 0,
        matchedStatus: 'UNMATCHED',
      },
    ];

    // 12. Budgets
    this.budgets = [
      {
        id: 'bgt-2026',
        year: 2026,
        organizationId: 'org-general',
        organizationName: 'النقابة العامة',
        title: 'الموازنة التقديرية العامة لعام 2026',
        totalAllocated: 5000000,
        totalCommitted: 800000,
        totalActual: 420000,
        status: 'APPROVED',
        lines: [
          { id: 'bgl-1', accountId: 'acc-5101', accountCode: '5101', accountName: 'مصروفات عمومية وإدارية', allocatedAmount: 1500000, committedAmount: 200000, actualAmount: 180000, availableAmount: 1120000, variancePercentage: 12 },
          { id: 'bgl-2', accountId: 'acc-5102', accountCode: '5102', accountName: 'مصروفات دعم ورعاية الأعضاء', allocatedAmount: 2500000, committedAmount: 450000, actualAmount: 150000, availableAmount: 1900000, variancePercentage: 6 },
          { id: 'bgl-3', accountId: 'acc-5103', accountCode: '5103', accountName: 'مصروفات مؤتمرات وتدريب نقابي', allocatedAmount: 1000000, committedAmount: 150000, actualAmount: 90000, availableAmount: 760000, variancePercentage: 9 },
        ],
      },
    ];

    // 13. Fixed Assets
    this.assets = [
      {
        id: 'ast-01',
        assetCode: 'AST-2026-01',
        name: 'خادم حاسوبي مركزي Data Server Dell PowerEdge',
        category: 'أجهزة وتكنولوجيا المعلومات',
        organizationId: 'org-general',
        costCenterId: 'cc-admin',
        purchaseDate: '2025-01-10',
        purchaseCost: 200000,
        salvageValue: 20000,
        usefulLifeMonths: 48,
        accumulatedDepreciation: 45000,
        bookValue: 155000,
        custodianName: 'م. أحمد مصطفى',
        location: 'غرفة الخوادم الرئيسية - الدور الثالث',
        status: 'ACTIVE',
      },
      {
        id: 'ast-02',
        assetCode: 'AST-2026-02',
        name: 'طابعات إصدار الكارنيهات والشهادات الحرارية',
        category: 'أجهزة وتجهيزات مكتبية',
        organizationId: 'org-general',
        costCenterId: 'cc-membership',
        purchaseDate: '2025-06-15',
        purchaseCost: 150000,
        salvageValue: 10000,
        usefulLifeMonths: 36,
        accumulatedDepreciation: 35000,
        bookValue: 115000,
        custodianName: 'أ. سمير عبد الله',
        location: 'إدارة العضوية والاشتراكات',
        status: 'ACTIVE',
      },
    ];

    // 14. Initial DMS Document Attachments with Digital Signatures
    this.attachments = [
      {
        id: 'doc-001',
        entityType: 'JOURNAL_ENTRY',
        entityId: 'jv-001',
        fileName: 'فاتورة_توريد_شركة_الأمل_INV-8891.pdf',
        fileSize: 482910,
        fileType: 'application/pdf',
        sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        description: 'الفاتورة الضريبية المعتمدة لتوريد مستلزمات اللجان النقابية',
        uploadedBy: 'usr-cfo',
        uploadedByName: 'د. محمود الشافعي (المدير المالي)',
        uploadedAt: '2026-02-01T10:30:00Z',
        digitalSignature: {
          signedBy: 'usr-cfo',
          signerName: 'د. محمود الشافعي',
          signerRole: 'CHIEF_FINANCIAL_OFFICER',
          signedAt: '2026-02-01T10:35:00Z',
          sealCode: 'SEAL-EGP-CFO-9821-APPROVED',
          certThumbprint: 'SHA256:7B992144C3F082AA9821BBEC54',
          isValid: true,
          notes: 'مستند مؤيد معتمد ومطابق لأمر الشراء رقم PO-2026-042',
        },
      },
      {
        id: 'doc-002',
        entityType: 'RECEIPT',
        entityId: 'rc-001',
        fileName: 'إشعار_تحويل_بنكي_البنك_الأهلي.pdf',
        fileSize: 215300,
        fileType: 'application/pdf',
        sha256Hash: 'a89f31a298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852c911',
        description: 'إشعار تحويل الإيرادات عبر نظام الربط البنكي الفوري',
        uploadedBy: 'usr-collector',
        uploadedByName: 'أ. طارق عبد العظيم (مسؤول التحصيل والخزينة)',
        uploadedAt: '2026-02-02T11:00:00Z',
        digitalSignature: {
          signedBy: 'usr-cfo',
          signerName: 'د. محمود الشافعي',
          signerRole: 'CHIEF_FINANCIAL_OFFICER',
          signedAt: '2026-02-02T11:15:00Z',
          sealCode: 'SEAL-EGP-TREASURY-0091-VALID',
          certThumbprint: 'SHA256:99EFA12048BC71939AA01',
          isValid: true,
          notes: 'تمت المراجعة والتطابق مع كشف حساب البنك الأهلي',
        },
      },
    ];

    // 15. Initial Real-time Notifications & Alerts
    this.notifications = [
      {
        id: 'notif-1',
        title: 'قيد محاسبي جديد بانتظار الاعتماد (SoD)',
        message: 'تم إرسال قيد اليومية [JV-2026-0002] بقيمة 15,000 ج.م من المحاسب العام وهو بانتظار اعتماد المدير المالي.',
        type: 'APPROVAL_PENDING',
        severity: 'WARNING',
        targetRole: 'CHIEF_FINANCIAL_OFFICER',
        organizationId: 'org-general',
        timestamp: '2026-02-18T09:15:00Z',
        isRead: false,
        actionTab: 'journals',
        entityId: 'jv-002',
      },
      {
        id: 'notif-2',
        title: 'تنبيه اقتراب موازنة بنك المصروفات الإدارية',
        message: 'بند مصروفات عمومية وإدارية [5101] وصل إلى 82% من الاعتماد المخصص المتاح لعام 2026.',
        type: 'BUDGET_OVERRUN',
        severity: 'WARNING',
        targetRole: 'ALL',
        organizationId: 'org-general',
        timestamp: '2026-02-17T14:30:00Z',
        isRead: false,
        actionTab: 'budgets',
        entityId: 'bgt-2026',
      },
      {
        id: 'notif-3',
        title: 'تنبيه رصيد الأستاذ المساعد للمدينين 1301',
        message: 'تجاوز رصيد شركة الأمل للمقاولات في حساب 1301 مبلغ 50,000 ج.م كمديونية قائمة تتطلب متابعة تحصيل.',
        type: 'DEBTOR_LIMIT',
        severity: 'INFO',
        targetRole: 'CHIEF_FINANCIAL_OFFICER',
        organizationId: 'org-general',
        timestamp: '2026-02-16T11:00:00Z',
        isRead: true,
        actionTab: 'subledgers',
        entityId: 'party-1301-1',
      },
      {
        id: 'notif-4',
        title: 'مراقبة الذكاء الاصطناعي (Gemini AI Guard)',
        message: 'أكمل فاحص الشذوذ والاحتيال فحص القيود لشهر فبراير بنسبة مطابقة 99.4% واكتشف 1 معاملة بحاجة لمراجعة التوثيق.',
        type: 'ANOMALY_DETECTED',
        severity: 'INFO',
        targetRole: 'ALL',
        organizationId: 'org-general',
        timestamp: '2026-02-15T08:00:00Z',
        isRead: true,
        actionTab: 'ai',
      },
    ];

    // Initial audit log
    this.recordAudit(
      'usr-admin',
      'المهندس أحمد مصطفى (مدير النظام)',
      'SYSTEM_ADMIN',
      'org-general',
      'SYSTEM_INITIALIZED',
      'SYSTEM',
      'GLOBAL',
      'تهيئة النظام المالي والمحاسبي الموحد للنقابة العامة وتدشين دليل الحسابات وقواعد التوزيع وسجل المدينين 1301'
    );

    // ===== 16. Journal Templates (قوالب القيود الذكية - IMPROVEMENTS 1.1 / 2.1) =====
    const tplNow = new Date().toISOString();
    this.journalTemplates = [
      {
        id: 'tpl-maintenance',
        name: 'Maintenance Expense',
        nameAr: 'قيد مصروفات صيانة',
        description: 'قيد صرف مصروفات صيانة وإصلاحات من الخزينة أو البنك',
        category: 'صيانة',
        debitAccountCode: '5101',
        creditAccountCode: '1101',
        keywords: ['صيانة', 'إصلاح', 'اصلاح', 'ترميم'],
        isActive: true,
        createdAt: tplNow,
        updatedAt: tplNow,
      },
      {
        id: 'tpl-salary',
        name: 'Salary Payment',
        nameAr: 'قيد صرف رواتب',
        description: 'قيد صرف رواتب وأجور العاملين عبر البنك',
        category: 'راتب',
        debitAccountCode: '5101',
        creditAccountCode: '1102',
        keywords: ['راتب', 'رواتب', 'أجور', 'اجور', 'مستحقات العاملين', 'مرتب'],
        isActive: true,
        createdAt: tplNow,
        updatedAt: tplNow,
      },
      {
        id: 'tpl-revenue-subscription',
        name: 'Subscription Revenue',
        nameAr: 'قيد إيراد اشتراكات',
        description: 'قيد تحصيل اشتراكات عضوية نقداً أو تحويلاً بنكياً',
        category: 'إيراد',
        debitAccountCode: '1101',
        creditAccountCode: '4101',
        keywords: ['اشتراك', 'اشتراكات', 'تحصيل اشتراكات', 'إيراد عضوية'],
        isActive: true,
        createdAt: tplNow,
        updatedAt: tplNow,
      },
      {
        id: 'tpl-cert-fees',
        name: 'Certificate Fees Revenue',
        nameAr: 'قيد رسوم شهادات',
        description: 'قيد تحصيل رسوم إصدار وتجديد الشهادات',
        category: 'إيراد',
        debitAccountCode: '1101',
        creditAccountCode: '4102',
        keywords: ['شهادة', 'شهادات', 'تجديد كارنيه', 'كارنيه', 'رسوم شهادة'],
        isActive: true,
        createdAt: tplNow,
        updatedAt: tplNow,
      },
      {
        id: 'tpl-travel',
        name: 'Travel & Mission Expense',
        nameAr: 'قيد مصروفات انتقالات ومهمات',
        description: 'قيد صرف انتقالات ومهمات عمل رسمية',
        category: 'مصروف',
        debitAccountCode: '5103',
        creditAccountCode: '1101',
        keywords: ['انتقالات', 'مهمة عمل', 'مهمات', 'سفر', 'ندوة', 'مؤتمر', 'تدريب'],
        isActive: true,
        createdAt: tplNow,
        updatedAt: tplNow,
      },
    ];

    // ===== 17. أجهزة البصمة المعتمدة (حضور وانصراف) =====
    this.attendanceDevices = [
      {
        id: 'dev-fp-gate',
        name: 'جهاز بصمة الإصبع — البوابة الرئيسية',
        type: 'FINGERPRINT',
        location: 'المدخل الرئيسي — مقر النقابة العامة',
        isActive: true,
      },
      {
        id: 'dev-face-floor3',
        name: 'جهاز بصمة الوجه — الدور الثالث',
        type: 'FACE',
        location: 'الدور الثالث — الإدارة المالية',
        isActive: true,
      },
      {
        id: 'dev-hybrid-annex',
        name: 'جهاز هجين (وجه/إصبع) — الملحق الإداري',
        type: 'HYBRID',
        location: 'الملحق الإداري — شئون العاملين',
        isActive: true,
      },
    ];
  }
  /**
   * ===== IMPROVEMENTS 1.1: تسجيل تغيّر رصيد حساب في سجل التحديثات المحاسبية =====
   */
  public recordAccountingHistory(
    account: Account,
    previousBalance: number,
    changeAmount: number,
    reason: string,
    journalEntryId?: string
  ): AccountingHistoryRecord {
    const record: AccountingHistoryRecord = {
      id: `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      previousBalance: Math.round(previousBalance * 100) / 100,
      currentBalance: Math.round(account.currentBalance * 100) / 100,
      changeAmount: Math.round(changeAmount * 100) / 100,
      reason,
      journalEntryId,
      createdAt: new Date().toISOString(),
    };
    this.accountingHistory.unshift(record);
    return record;
  }

  /**
   * ===== IMPROVEMENTS 5.1: حالة الأمان للمستخدم (محاولات الدخول والقفل) =====
   */
  public getSecurityState(userId: string): UserSecurityState {
    let state = this.userSecurity.get(userId);
    if (!state) {
      state = {
        userId,
        failedAttempts: 0,
        twoFactorEnabled: false,
      };
      this.userSecurity.set(userId, state);
    }
    return state;
  }
}

export const erpStore = new ERPStore();
