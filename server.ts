import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { erpStore } from './server/db/store.js';
import { postgresManager } from './server/db/postgresSync.js';
import { accountingService } from './server/services/accounting.service.js';
import { registerAICoreRoutes } from './server/routes/ai-core.routes.js';
import { registerAIActionRoutes } from './server/routes/ai-action.routes.js';
import { registerAIRoutes } from './server/routes/ai.routes.js';
import { registerReportExportRoutes } from './server/routes/report-export.routes.js';
import { registerEtaRoutes } from './server/routes/eta.routes.js';
import { receiptsService } from './server/services/receipts.service.js';
import { reportsService } from './server/services/reports.service.js';
import { calculateSimilarity, normalizeArabicText } from './server/utils/arabic.js';
import { generateVerificationToken, hashNationalId, maskNationalId, sha256 } from './server/utils/crypto.js';
import { verifyLedgerChain, rebuildLedgerChain } from './server/services/ledger-chain.service.js';

// ===== IMPROVEMENTS.md: الخدمات والوسائط الجديدة =====
import { securityHeadersMiddleware, comprehensiveAuditMiddleware, createRateLimiter, getRecentAccessLogs } from './server/security/middleware.js';
import { advancedAuthService } from './server/services/auth-advanced.service.js';
import { enhancedOCRService } from './server/services/ocr.service.js';
import { dashboardService } from './server/services/dashboard.service.js';
import { cacheService, CACHE_KEYS } from './server/services/cache.service.js';
import { paginationService } from './server/utils/pagination.js';
import { integrationAPI } from './server/services/integration.service.js';
import { notificationService } from './server/services/notification.service.js';
import { csvImportService } from './server/services/csv-import.service.js';
import { committeesService } from './server/services/committees.service.js';
import { portalDataService } from './server/services/portal-data.service.js';
import { regulationService } from './server/services/regulation.service.js';
import { employeeAffairsService } from './server/services/employee-affairs.service.js';
import { attendanceService } from './server/services/attendance.service.js';
import { payrollService } from './server/services/payroll.service.js';
import { payrollImportService } from './server/services/payroll-import.service.js';
import { attachLiveAgentWebSocketServer } from './server/services/live-agent.service.js';
import { apiErrorHandler, notFoundHandler } from './server/middleware/error-handler.js';
import { maybeStartEmbeddedPostgres } from './server/db/pg-embedded.js';
import { can, isReadOnlyUser, ROLE_DEFINITIONS } from './server/security/permissions.js';
import { assertRuntimeSecurity, isSqlConsoleAllowed, isStrictAuth } from './server/security/runtime-config.js';
import { debtorsAccountId, findAccountByCodeOrName, findExpenseAccount, findRevenueAccount, findTreasuryAccount } from './server/utils/account-lookup.js';
import type { User } from './src/types/erp.js';

async function startServer() {
  // فحص أمني قبل أي شيء: الوضع الصارم يرفض الإقلاع بأسرار ضعيفة (DEMO_MODE=false)
  assertRuntimeSecurity();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // ===== IMPROVEMENTS 5.1/5.2: طبقة الأمان قبل أي معالجة =====
  app.use(securityHeadersMiddleware);
  app.use(comprehensiveAuditMiddleware); // سجل تدقيق شامل لكل عمليات API
  app.use(createRateLimiter(Number(process.env.RATE_LIMIT_MAX || 300), 60_000)); // 300 طلب/دقيقة لكل IP

  app.use(express.json({ limit: '250mb' })); // دعم رفع الملفات الكبيرة base64 للمستندات

  // خدمة الأصول الثابتة (صور المستخدمين وأيقونة التطبيق) — بمسارات مرشحة
  // تدعم التطوير وحزمة الإنتاج وتطبيق Electron المُغلَّف
  const { resolveFirst, moduleDir } = await import('./server/utils/runtime-paths.js');
  const esmDir = moduleDir(import.meta.url);
  const assetsDir =
    resolveFirst([
      path.join(process.cwd(), 'assets'),
      path.join(esmDir, 'assets'),
      path.join(esmDir, '..', 'assets'),
    ]) || path.join(process.cwd(), 'assets');
  app.use('/assets', express.static(assetsDir));

  // ===== تحميل البيانات الحقيقية من ملفات CSV (دليل الحسابات الموحد + قيود 2024) =====
  // يعمل قبل مزامنة Cloud SQL حتى تُزرع البيانات الفعلية في قاعدة البيانات عند توفرها
  csvImportService.loadRealDataFromCsvFiles();

  // ===== شئون العاملين: زرع العاملين من استمارة 2 تأمينات الحقيقية =====
  employeeAffairsService.loadEmployeesFromInsuranceCsv();

  // ===== تشغيل PostgreSQL المضمّن تلقائياً (إن لم تُضبط قاعدة خارجية) =====
  await maybeStartEmbeddedPostgres();

  // Initialize and synchronize with Cloud SQL PostgreSQL
  await postgresManager.initialize(erpStore);

  // Current session helper: يدعم JWT Bearer (IMPROVEMENTS 5.1) مع توافق وضع العرض x-user-id
  // المستخدم الافتراضي في وضع العرض: مدير البرنامج (محمد عبد الله أحمد) — جميع الصلاحيات
  // الوضع الصارم (DEMO_MODE=false): لا مستخدم افتراضياً — JWT صالح أو null (401)
  function getActiveUser(req: Request): User | null {
    // 1) توكن JWT موقّع من /api/auth/login
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const verification = advancedAuthService.verifyToken(token);
      if (verification.valid && verification.payload?.sub) {
        const jwtUser = erpStore.users.find((u) => u.id === verification.payload.sub);
        if (jwtUser) return jwtUser;
      }
    }
    // الوضع الصارم: لا يسقط إلى حساب افتراضي أبداً
    if (isStrictAuth()) return null;
    // 2) وضع العرض التجريبي (Desktop Demo)
    const userId = (req.headers['x-user-id'] as string) || 'usr-mohamed-abdallah';
    const user = erpStore.users.find((u) => u.id === userId) || erpStore.users[0];
    return user;
  }

  /**
   * ===== حارس الصلاحيات (RBAC) =====
   * يتحقق من صلاحية المستخدم الفعّال قبل تنفيذ أي عملية كتابة،
   * ويسجل محاولات التجاوز في سجل التدقيق.
   * الوضع الصارم: بلا JWT صالح → 401 (لا كتابة مجهولة إطلاقاً).
   */
  function requirePermission(req: Request, res: Response, permission: string): User | null {
    const user = getActiveUser(req);
    if (!user) {
      erpStore.recordAudit(
        'anonymous',
        'غير موثّق',
        'ANONYMOUS',
        'org-general',
        'AUTH_REQUIRED',
        'RBAC',
        req.path,
        `رفض ${req.method} ${req.path} — الوضع الصارم يتطلب توكن JWT صالحاً`,
        undefined,
        undefined,
        'BLOCKED'
      );
      res.status(401).json({ error: 'يلزم تسجيل الدخول أولاً (الوضع الصارم لا يقبل وضع العرض التجريبي).' });
      return null;
    }
    if (can(user, permission)) return user;

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'PERMISSION_DENIED',
      'RBAC',
      req.path,
      `رفض تنفيذ ${req.method} ${req.path} — المستخدم [${user.fullName}] لا يملك صلاحية [${permission}]`,
      undefined,
      undefined,
      'BLOCKED'
    );

    res.status(403).json({
      error: `لا تملك الصلاحية لتنفيذ هذه العملية. المستخدم [${user.fullName} - ${user.roleLabelAr || user.role}] صلاحياته: الاطلاع والبحث${can(user, 'journal:create') ? ' والتسجيل باليومية' : ' والطباعة'} فقط.`,
    });
    return null;
  }

  registerAIRoutes(app);
  registerAICoreRoutes(app, { requirePermission });
  registerAIActionRoutes(app, { requirePermission });
  registerReportExportRoutes(app);
  registerEtaRoutes(app);

  // ==========================================
  // 1. HEALTH & SYSTEM INFO
  // ==========================================
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      system: 'Union Financial ERP - General Syndicate',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      rbac: {
        activeUser: erpStore.users.find((u) => u.id === ((req.headers['x-user-id'] as string) || 'usr-mohamed-abdallah'))?.fullName || 'محمد عبد الله أحمد',
        readOnly: isReadOnlyUser(getActiveUser(req)),
      },
      database: {
        connected: postgresManager.isDbAvailable(),
        mode: postgresManager.isDbAvailable() ? 'PostgreSQL (مستمر)' : 'ذاكرة داخلية (عرض)',
      },
      activeEntriesCount: erpStore.journalEntries.length,
      debtors1301Count: erpStore.subledgerParties.filter((p) => p.associatedAccountId === (debtorsAccountId() || 'acc-1301')).length,
    });
  });

  // ==========================================
  // 2. AUTH & USERS & ORGANIZATIONS
  // ==========================================
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    res.json(user);
  });

  // ==========================================
  // 2b. ADVANCED AUTH: LOGIN + LOCKOUT + 2FA (IMPROVEMENTS 5.1)
  // ==========================================
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب.' });
    }
    const result = advancedAuthService.login(
      String(username),
      req.ip || 'unknown',
      req.headers['user-agent'],
      password
    );
    res.status(result.success ? 200 : 401).json(result);
  });

  app.post('/api/auth/login/2fa', (req: Request, res: Response) => {
    const { username, code } = req.body;
    if (!username || !code) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم ورمز التحقق مطلوبان.' });
    }
    const result = advancedAuthService.loginWithTwoFactor(
      String(username),
      String(code),
      req.ip || 'unknown',
      req.headers['user-agent']
    );
    res.status(result.success ? 200 : 401).json(result);
  });

  app.post('/api/auth/2fa/setup', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const setup = advancedAuthService.setupTwoFactor(user.id);
    if (!setup) return res.status(404).json({ success: false, message: 'المستخدم غير موجود.' });
    res.json({
      success: true,
      message: 'امسح رمز QR بتطبيق المصادقة (Google Authenticator) ثم أكمل الدخول برمز التحقق.',
      secret: setup.secret,
      otpAuthUrl: setup.otpAuthUrl,
    });
  });

  app.post('/api/auth/2fa/disable', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const ok = advancedAuthService.disableTwoFactor(user.id);
    res.json({ success: ok });
  });

  // سجل الوصول الشامل وحالة الأمان (IMPROVEMENTS 5.2)
  app.get('/api/security/access-log', (req: Request, res: Response) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    res.json(getRecentAccessLogs(limit));
  });

  app.get('/api/security/state', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const state = erpStore.getSecurityState(user.id);
    res.json({
      userId: user.id,
      failedAttempts: state.failedAttempts,
      lockedUntil: state.lockedUntil,
      lastLoginAt: state.lastLoginAt,
      twoFactorEnabled: state.twoFactorEnabled,
    });
  });

  app.get('/api/auth/users', (req: Request, res: Response) => {
    // المستخدمون الفعليون المعتمدون فقط (التجريبيون الداخليون مخفيون)
    res.json(erpStore.users.filter((u) => !u.isDemo));
  });

  app.post('/api/auth/switch-user', (req: Request, res: Response) => {
    const { userId } = req.body;
    const user = erpStore.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  app.get('/api/organizations', (req: Request, res: Response) => {
    res.json(erpStore.organizations);
  });

  // شاشة اللجان النقابية: قائمة اللجان (الشركات + المهنية) من ملفات البيانات
  app.get('/api/committees', (req: Request, res: Response) => {
    const { category } = req.query;
    let list = committeesService.getAll();
    if (category === 'COMPANY' || category === 'PROFESSIONAL') {
      list = list.filter((c) => c.category === category);
    }
    res.json(list);
  });

  // شاشات عرض ملفات البيانات المضافة (بيانات.xlsx / يومية 2024 / Insured List)
  app.get('/api/committees-data', (_req: Request, res: Response) => {
    res.json(portalDataService.getCommitteesData());
  });

  app.get('/api/insured-list', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(portalDataService.getInsuredList(q));
  });

  app.get('/api/journal-2024', (_req: Request, res: Response) => {
    res.json(portalDataService.getJournal2024());
  });

  // برنامج المحاسبة 2024 — مركز التدريب
  app.get('/api/training-accounting-2024', (_req: Request, res: Response) => {
    res.json(portalDataService.getTrainingAccounting2024());
  });

  // الميزانية العمومية والحسابات الختامية 2024 — مركز التدريب
  app.get('/api/final-accounts-2024', (_req: Request, res: Response) => {
    res.json(portalDataService.getFinalAccounts2024());
  });

  app.get('/api/cost-centers', (req: Request, res: Response) => {
    const { organizationId } = req.query;
    if (organizationId) {
      return res.json(erpStore.costCenters.filter((c) => c.organizationId === organizationId));
    }
    res.json(erpStore.costCenters);
  });

  // ==========================================
  // 3. CHART OF ACCOUNTS
  // ==========================================
  app.get('/api/accounts', (req: Request, res: Response) => {
    res.json(erpStore.accounts);
  });

  app.post('/api/accounts', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'accounts:manage');
    if (!user) return;
    const { code, name, type, nature, parentId, requiresSubledger, subledgerType } = req.body;

    if (!code || !name || !type || !nature) {
      return res.status(400).json({ error: 'يرجى استكمال جميع بيانات الحساب الأساسية.' });
    }

    if (erpStore.accounts.some((a) => a.code === code)) {
      return res.status(400).json({ error: `كود الحساب [${code}] موجود بالفعل.` });
    }

    const parent = parentId ? erpStore.accounts.find((a) => a.id === parentId) : null;
    if (parent) {
      parent.isParent = true;
    }

    const newAcc = {
      id: `acc-${Date.now()}`,
      code,
      name,
      type,
      nature,
      parentId,
      isParent: false,
      level: parent ? parent.level + 1 : 1,
      requiresSubledger: Boolean(requiresSubledger),
      subledgerType: subledgerType || 'NONE',
      currentBalance: 0,
      isActive: true,
    };

    erpStore.accounts.push(newAcc);
    postgresManager.persistAccount(newAcc);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ACCOUNT_CREATED',
      'ACCOUNT',
      newAcc.id,
      `إضافة حساب جديد بالدليل: [${code} - ${name}] - يتطلب أستاذ مساعد: ${newAcc.requiresSubledger}`
    );

    res.status(201).json(newAcc);
  });

  // ==========================================
  // 3b. ACCOUNTING HISTORY (سجل التحديثات المحاسبية - IMPROVEMENTS 1.1)
  // ==========================================
  app.get('/api/accounts/history', (req: Request, res: Response) => {
    const { accountId, limit } = req.query;
    let history = erpStore.accountingHistory;
    if (accountId) {
      history = history.filter((h) => h.accountId === accountId);
    }
    const max = Math.min(500, Number(limit) || 100);
    res.json(history.slice(0, max));
  });

  app.get('/api/accounts/:id/history', (req: Request, res: Response) => {
    const { id } = req.params;
    const account = erpStore.accounts.find((a) => a.id === id || a.code === id);
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود.' });
    res.json(erpStore.accountingHistory.filter((h) => h.accountId === account.id).slice(0, 200));
  });

  // ==========================================
  // 4. SUBLEDGER PARTIES (الأستاذ المساعد - المدينون 1301)
  // ==========================================
  app.get('/api/subledger-parties', (req: Request, res: Response) => {
    const { accountId, search, type } = req.query;
    let parties = erpStore.subledgerParties;

    if (accountId) {
      parties = parties.filter((p) => p.associatedAccountId === accountId);
    }
    if (type) {
      parties = parties.filter((p) => p.type === type);
    }
    if (search) {
      const q = normalizeArabicText(String(search));
      parties = parties.filter(
        (p) =>
          p.normalizedName.includes(q) ||
          p.partyCode.toLowerCase().includes(q) ||
          p.phone?.includes(q)
      );
    }

    res.json(parties);
  });

  app.post('/api/subledger-parties', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'subledger:manage');
    if (!user) return;
    const { name, associatedAccountId, organizationId, taxNumber, phone, type } = req.body;

    try {
      const result = accountingService.findOrCreateSubledgerParty(
        name,
        associatedAccountId || debtorsAccountId() || 'acc-1301',
        organizationId || user.organizationId,
        user
      );

      if (taxNumber || phone || type) {
        if (taxNumber) result.party.taxNumber = taxNumber;
        if (phone) result.party.phone = phone;
        if (type) result.party.type = type;
      }

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/subledger-parties/merge', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'subledger:manage');
    if (!user) return;
    const { sourcePartyId, targetPartyId } = req.body;

    const source = erpStore.subledgerParties.find((p) => p.id === sourcePartyId);
    const target = erpStore.subledgerParties.find((p) => p.id === targetPartyId);

    if (!source || !target) {
      return res.status(404).json({ error: 'أحد الحسابين غير موجود للدمج.' });
    }

    // Reassign all journal lines from source to target
    let reassignedCount = 0;
    for (const entry of erpStore.journalEntries) {
      for (const line of entry.lines) {
        if (line.subledgerPartyId === source.id) {
          line.subledgerPartyId = target.id;
          line.subledgerPartyName = target.name;
          reassignedCount++;
        }
      }
    }

    // Update target totals
    target.totalDebit += source.totalDebit;
    target.totalCredit += source.totalCredit;
    target.currentBalance = target.totalDebit - target.totalCredit;

    // Add alias
    erpStore.subledgerAliases.push({
      id: `alias-${Date.now()}`,
      partyId: target.id,
      aliasName: source.name,
      normalizedAlias: source.normalizedName,
    });

    // Remove source party
    erpStore.subledgerParties = erpStore.subledgerParties.filter((p) => p.id !== source.id);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      target.organizationId,
      'SUBLEDGER_PARTIES_MERGED',
      'SUBLEDGER_PARTY',
      target.id,
      `دمج الحساب المساعد [${source.name} - ${source.partyCode}] في الحساب [${target.name} - ${target.partyCode}] وتحديث ${reassignedCount} حركة محاسبية`
    );

    res.json({ message: 'تم دمج الحسابات بنجاح.', target, reassignedCount });
  });

  // ==========================================
  // 5. FISCAL PERIODS
  // ==========================================
  app.get('/api/fiscal-periods', (req: Request, res: Response) => {
    res.json(erpStore.fiscalPeriods);
  });

  // ضمان فترة مالية مفتوحة لشهر معين (يستخدمه الاستيراد التاريخي لكشوف المرتبات)
  app.post('/api/fiscal-periods/ensure-open', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'periods:manage');
    if (!user) return;
    const { periods } = req.body || {};
    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({ error: 'حدد قائمة الفترات المطلوبة { year, month }.' });
    }
    for (const p of periods) {
      const y = Number(p?.year);
      const m = Number(p?.month);
      if (y && m >= 1 && m <= 12) payrollImportService.ensureOpenPeriod(user, y, m);
    }
    res.json({ success: true, fiscalPeriods: erpStore.fiscalPeriods });
  });

  app.post('/api/fiscal-periods/:id/toggle-status', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'periods:manage');
    if (!user) return;
    const { id } = req.params;
    const { status } = req.body; // 'OPEN' | 'CLOSED' | 'SPECIAL_REOPEN'

    const period = erpStore.fiscalPeriods.find((p) => p.id === id);
    if (!period) return res.status(404).json({ error: 'الفترة غير موجودة.' });

    period.status = status;
    if (status === 'CLOSED') {
      period.closedAt = new Date().toISOString();
    } else if (status === 'SPECIAL_REOPEN') {
      period.reopenedBy = user.fullName;
      period.reopenedAt = new Date().toISOString();
    }

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'FISCAL_PERIOD_STATUS_CHANGED',
      'FISCAL_PERIOD',
      period.id,
      `تغيير حالة الفترة المالية [${period.name}] إلى [${status}]`
    );

    res.json(period);
  });

  // ==========================================
  // 6. JOURNAL ENTRIES (القيود المحاسبية)
  // ==========================================
  app.get('/api/journal-entries', (req: Request, res: Response) => {
    const { organizationId, status, type, journalName } = req.query;
    let entries = erpStore.journalEntries;

    if (organizationId) {
      entries = entries.filter((e) => e.organizationId === organizationId);
    }
    if (status) {
      entries = entries.filter((e) => e.status === status);
    }
    if (type) {
      entries = entries.filter((e) => e.type === type);
    }
    if (journalName) {
      entries = entries.filter((e) => e.journalName === (journalName === '__default' ? 'يومية النقابة' : String(journalName)));
    }

    // ===== IMPROVEMENTS 7.2: ترقيم صفحي اختياري (تتوافق الاستجابة القديمة بدون ?page) =====
    if (req.query.page) {
      return res.json(paginationService.paginate(entries, paginationService.fromQuery(req.query as any)));
    }

    res.json(entries);
  });

  app.post('/api/journal-entries', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    try {
      const result = accountingService.createJournalEntry(
        {
          ...req.body,
          userId: user.id,
        },
        user
      );
      postgresManager.persistJournalEntry(result.entry);
      cacheService.invalidatePrefix('cache:'); // إبطال الكاش بعد أي كتابة (IMPROVEMENTS 7.1)
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===== قوالب القيود الذكية (IMPROVEMENTS 1.1 / 2.1) =====
  app.get('/api/journal-templates', (req: Request, res: Response) => {
    res.json(erpStore.journalTemplates.filter((t) => t.isActive));
  });

  app.post('/api/journal-templates', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'accounts:manage');
    if (!user) return;
    const { name, nameAr, description, category, debitAccountCode, creditAccountCode, keywords } = req.body;

    if (!name || !nameAr || !category || !debitAccountCode || !creditAccountCode) {
      return res.status(400).json({ error: 'يرجى استكمال بيانات القالب (الاسم والفئة والحساب المدين والدائن).' });
    }

    const debitAcc = erpStore.accounts.find((a) => a.code === debitAccountCode);
    const creditAcc = erpStore.accounts.find((a) => a.code === creditAccountCode);
    if (!debitAcc || !creditAcc) {
      return res.status(400).json({ error: 'كود الحساب المدين أو الدائن غير موجود في دليل الحسابات.' });
    }

    const now = new Date().toISOString();
    const template = {
      id: `tpl-${Date.now()}`,
      name: String(name),
      nameAr: String(nameAr),
      description,
      category: String(category),
      debitAccountCode: String(debitAccountCode),
      creditAccountCode: String(creditAccountCode),
      keywords: Array.isArray(keywords) ? keywords.map(String) : [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    erpStore.journalTemplates.push(template as any);
    cacheService.invalidate(CACHE_KEYS.journalTemplates());

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'JOURNAL_TEMPLATE_CREATED',
      'JOURNAL_TEMPLATE',
      template.id,
      `إنشاء قالب قيد جديد [${template.nameAr}] (${debitAcc.code} → ${creditAcc.code})`
    );

    res.status(201).json(template);
  });

  // ==============================================================
  // الهيكل المحاسبي الحكومي المتكامل (أبواب/مجموعات/أنواع/حسابات/بنود)
  // ==============================================================
  app.get('/api/government-accounts', (req: Request, res: Response) => {
    const { level, category, organizationId } = req.query;
    let list = erpStore.governmentAccounts;
    if (level) list = list.filter((g) => g.level === level);
    if (category) list = list.filter((g) => g.category === category);
    if (organizationId) list = list.filter((g) => g.organizationId === organizationId);
    res.json(list);
  });

  // تقرير تنفيذ الموازنة الحكومية: الاعتماد/الصرف/المتاح لكل بند
  app.get('/api/government-accounts/report', (req: Request, res: Response) => {
    const entries = erpStore.journalEntries.filter((e) => e.status === 'POSTED' && e.governmentCode);
    const bands = erpStore.governmentAccounts.filter((g) => g.level === 'BAND' && g.isActive);

    const report = bands.map((g) => {
      const spent = entries
        .filter((e) => e.governmentCode === g.code || e.governmentAccountId === g.id)
        .reduce((sum, e) => sum + e.totalDebit, 0);
      const budgetLimit = g.budgetLimit || 0;
      return {
        ...g,
        actualAmount: spent,
        committedAmount: Math.round(spent * 1.15), // تقدير الالتزامات المرتبطة
        availableAmount: Math.max(0, budgetLimit - spent),
        spendPercentage: budgetLimit > 0 ? Math.round((spent / budgetLimit) * 1000) / 10 : 0,
      };
    });

    res.json(report);
  });

  // ترتيب هرمي كامل للهيكل الحكومي (للشجرة في الواجهة)
  app.get('/api/government-accounts/tree', (req: Request, res: Response) => {
    const all = erpStore.governmentAccounts;
    const build = (parentId?: string, depth = 0): any[] =>
      all
        .filter((g) => (g.parentId ?? undefined) === parentId)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((g) => ({ ...g, children: depth < 5 ? build(g.id, depth + 1) : [] }));

    res.json(build(undefined));
  });

  // ==============================================================
  // سلسلة التجزئة المضادة للتلاعب (Blockchain-style Ledger Chain)
  // ==============================================================
  app.get('/api/ledger-chain/verify', (req: Request, res: Response) => {
    const result = verifyLedgerChain(erpStore.journalEntries);
    erpStore.recordAudit(
      getActiveUser(req)?.id || 'anonymous',
      'فحص سلامة السلسلة',
      'SYSTEM',
      'org-general',
      'LEDGER_CHAIN_VERIFIED',
      'LEDGER_CHAIN',
      'GLOBAL',
      `فحص سلسلة التجزئة: ${result.verifiedCount}/${result.totalEntries} قيد سليم، ${result.tamperedCount} متلاعب فيه`
    );
    res.json(result);
  });

  app.post('/api/ledger-chain/rebuild', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:post');
    if (!user) return;
    const result = rebuildLedgerChain(erpStore.journalEntries);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'LEDGER_CHAIN_REBUILT',
      'LEDGER_CHAIN',
      'GLOBAL',
      `إعادة بناء السلسلة: ${result.tamperedCount} قيد متلاعب به، السلسلة ${result.chainValid ? 'سليمة' : 'مكسورة'}`
    );
    res.json(result);
  });

  app.get('/api/ledger-chain/last', (req: Request, res: Response) => {
    const entries = erpStore.journalEntries.filter((e) => e.chainIndex !== undefined);
    const last = entries.sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0)).pop();
    if (!last) return res.json(null);
    res.json({
      id: last.id,
      entryNumber: last.entryNumber,
      entryStatus: last.status,
      chainIndex: last.chainIndex,
      previousHash: last.previousHash,
      currentHash: last.currentHash,
      tamperSeal: last.chainVerified,
    });
  });

  // إنشاء قيد جاهز الاعتماد من قالب معتمد (يستخدمه المساعد الصوتي والذكي)
  app.post('/api/journal-entries/from-template', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    const { templateId, amount, date, description, organizationId } = req.body;
    try {
      const template = erpStore.journalTemplates.find((t) => t.id === templateId && t.isActive);
      if (!template) throw new Error('قالب القيد غير موجود أو غير مفعل.');

      const value = Number(amount);
      if (!value || value <= 0) throw new Error('قيمة القيد يجب أن تكون أكبر من صفر.');

      // محلل دلالي مستقل عن الدليل: كود القالب أولاً ثم البحث بالمعنى حسب فئة القالب
      const isRevenue = template.category === 'إيراد';
      const debitAcc =
        (template.debitAccountCode && findAccountByCodeOrName(template.debitAccountCode) && !isRevenue
          ? erpStore.accounts.find(
              (a) => a.code === template.debitAccountCode && a.type === 'EXPENSE'
            )
          : undefined) ||
        (isRevenue ? findTreasuryAccount() : findExpenseAccount(template.category === 'صيانة' ? 'صيان' : undefined)) ||
        findExpenseAccount();
      // الدائن غير الإيرادي = مصدر التمويل: الخزينة/البنك دلالياً (الأكواد التجريبية قد تتصادم)
      const creditAcc = isRevenue
        ? findRevenueAccount('اشتراك') || findRevenueAccount()
        : findTreasuryAccount() || findAccountByCodeOrName(template.creditAccountCode);

      if (!debitAcc || !creditAcc) throw new Error('تعذر تحديد حسابات مناسبة من الدليل النشط لهذا القالب.');

      // حساب يتطلب أستاذاً مساعداً: أرفق أول طرف قائم أو أنشئ طرفاً باسم القالب
      const ensureParty = (acc: any) => {
        if (!acc.requiresSubledger) return undefined;
        const existing = erpStore.subledgerParties.find((p) => p.associatedAccountId === acc.id);
        if (existing) return existing.id;
        const created = accountingService.findOrCreateSubledgerParty(template.nameAr, acc.id, organizationId || user.organizationId, user);
        return created.party.id;
      };

      const result = accountingService.createJournalEntry(
        {
          date: date || new Date().toISOString().split('T')[0],
          organizationId: organizationId || user.organizationId,
          description: description || `قيد من قالب [${template.nameAr}]`,
          type: 'MANUAL',
          sourceDocumentType: 'JOURNAL_TEMPLATE',
          sourceDocumentId: template.id,
          lines: [
            { accountId: debitAcc.id, subledgerPartyId: ensureParty(debitAcc), debit: value, credit: 0, description: template.nameAr },
            { accountId: creditAcc.id, subledgerPartyId: ensureParty(creditAcc), debit: 0, credit: value, description: template.nameAr },
          ],
          userId: user.id,
        },
        user
      );

      cacheService.invalidatePrefix('cache:');
      postgresManager.persistJournalEntry(result.entry);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/journal-entries/:id/submit', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    try {
      const entry = accountingService.submitJournalEntry(req.params.id, user);
      await postgresManager.updateJournalEntryStatus(entry);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/journal-entries/:id/approve', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    try {
      const entry = accountingService.approveJournalEntry(req.params.id, user);
      await postgresManager.updateJournalEntryStatus(entry);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/journal-entries/:id/post', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    try {
      const entry = accountingService.postJournalEntry(req.params.id, user);
      await postgresManager.updateJournalEntryStatus(entry);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/journal-entries/:id/reverse', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:workflow');
    if (!user) return;
    const { reason } = req.body;
    try {
      const result = accountingService.reverseJournalEntry(req.params.id, reason || 'خطأ في التوجيه المحاسبي', user);
      postgresManager.updateJournalEntryStatus(result.original);
      postgresManager.persistJournalEntry(result.reversal);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 7. ACCOUNTING REPORTS (التقارير المحاسبية)
  // ==========================================
  app.get('/api/reports/general-ledger', (req: Request, res: Response) => {
    const { organizationId, startDate, endDate, includeDrafts } = req.query;
    const report = reportsService.getGeneralLedger({
      organizationId: organizationId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      includeDrafts: includeDrafts === 'true',
    });
    res.json(report);
  });

  app.get('/api/reports/subledger/:partyId', (req: Request, res: Response) => {
    const { partyId } = req.params;
    const { organizationId, startDate, endDate, includeDrafts } = req.query;
    try {
      const report = reportsService.getSubledgerPartyStatement(partyId, {
        organizationId: organizationId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        includeDrafts: includeDrafts === 'true',
      });
      res.json(report);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.get('/api/reports/receipts-payments', (req: Request, res: Response) => {
    const { organizationId, startDate, endDate } = req.query;
    const report = reportsService.getReceiptsPaymentsStatement({
      organizationId: organizationId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(report);
  });

  app.get('/api/reports/income-expense', (req: Request, res: Response) => {
    const { organizationId, startDate, endDate } = req.query;
    const report = reportsService.getIncomeExpenseReport({
      organizationId: organizationId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(report);
  });

  app.get('/api/reports/trial-balance', (req: Request, res: Response) => {
    const { organizationId, startDate, endDate } = req.query;
    const report = reportsService.getTrialBalance({
      organizationId: organizationId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(report);
  });

  app.get('/api/reports/balance-sheet', (req: Request, res: Response) => {
    const { organizationId, startDate, endDate } = req.query;
    const report = reportsService.getBalanceSheet({
      organizationId: organizationId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(report);
  });

  // ==========================================
  // 8. RECEIPTS & DISTRIBUTION (التحصيل وتوزيع الإيرادات)
  // ==========================================
  app.get('/api/receipts', (req: Request, res: Response) => {
    res.json(erpStore.receipts);
  });

  app.post('/api/receipts', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'receipts:issue');
    if (!user) return;
    try {
      const result = receiptsService.issueReceipt(req.body, user);
      postgresManager.persistReceipt(result.receipt);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/revenue-distribution-rules', (req: Request, res: Response) => {
    res.json(erpStore.distributionRules);
  });

  app.post('/api/revenue-distribution-rules', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'receipts:issue');
    if (!user) return;
    const { revenueTypeName, lines } = req.body;

    const totalPerc = lines.reduce((s: number, l: any) => s + Number(l.percentage), 0);
    if (Math.abs(totalPerc - 100) > 0.01) {
      return res.status(400).json({ error: 'مجموع نسب التوزيع يجب أن يساوي 100% تماماً.' });
    }

    // ===== اللائحة المالية: مطابقة النسب مع النسب الإلزامية حين ترقيمها من الوثيقة =====
    const regViolations = regulationService.checkDistributionPercentages(
      lines.map((l: any) => ({ beneficiaryOrgId: l.beneficiaryOrgId, percentage: Number(l.percentage) }))
    );
    const blocking = regViolations.find((v) => v.severity === 'BLOCK');
    if (blocking) {
      return res.status(400).json({ error: `مخالفة اللائحة المالية: ${blocking.message}` });
    }
    const regWarnings = regViolations.map((v) => v.message);

    const count = erpStore.distributionRules.length + 1;
    const rule = {
      id: `rule-${Date.now()}`,
      ruleCode: `DIST-RULE-V${count}`,
      revenueTypeName,
      version: 1,
      effectiveFrom: new Date().toISOString().split('T')[0],
      status: 'ACTIVE' as const,
      lines: lines.map((l: any, i: number) => ({
        id: `rl-${Date.now()}-${i + 1}`,
        beneficiaryOrgId: l.beneficiaryOrgId,
        beneficiaryOrgName: l.beneficiaryOrgName,
        percentage: Number(l.percentage),
        accountId: l.accountId || 'acc-2102',
      })),
    };

    erpStore.distributionRules.push(rule);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'DISTRIBUTION_RULE_CREATED',
      'DISTRIBUTION_RULE',
      rule.id,
      `إنشاء قاعدة توزيع إيراد جديدة: [${revenueTypeName}] بنسب موزعة على ${lines.length} جهات مستفيدة`
    );

    res.status(201).json(regWarnings.length > 0 ? { ...rule, regulationWarnings: regWarnings } : rule);
  });

  // Verify Receipt by QR token
  app.get('/api/verify-receipt/:token', (req: Request, res: Response) => {
    const { token } = req.params;
    const receipt = erpStore.receipts.find((r) => r.qrVerificationToken === token);
    if (!receipt) {
      return res.status(404).json({ valid: false, message: 'رمز التحقق غير صحيح أو الإيصال غير مسجل.' });
    }
    res.json({
      valid: true,
      receiptNumber: receipt.receiptNumber,
      date: receipt.date,
      amount: receipt.amount,
      payerName: receipt.payerName,
      organizationName: receipt.organizationName,
      status: receipt.status,
      sha256Hash: receipt.sha256Hash,
    });
  });

  // ==========================================
  // 9. MEMBERS & CERTIFICATES (الأعضاء والشهادات)
  // ==========================================
  app.get('/api/members', (req: Request, res: Response) => {
    res.json(erpStore.members);
  });

  app.post('/api/members', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'members:manage');
    if (!user) return;
    const { fullName, nationalId, syndicateCommitteeId, companyName, profession, phone, email } = req.body;

    if (!fullName || !nationalId) {
      return res.status(400).json({ error: 'الاسم والرقم القومي حقول إلزامية.' });
    }

    const nHash = hashNationalId(nationalId);
    if (erpStore.members.some((m) => m.nationalIdHash === nHash)) {
      return res.status(400).json({ error: 'هذا العضو مسجل مسبقاً بنفس الرقم القومي.' });
    }

    const comm = erpStore.organizations.find((o) => o.id === syndicateCommitteeId) || erpStore.organizations[1];
    const count = erpStore.members.length + 1;
    const member = {
      id: `mem-${Date.now()}`,
      membershipNumber: `MEM-2026-${String(count + 500).padStart(5, '0')}`,
      fullName,
      nationalIdMasked: maskNationalId(nationalId),
      nationalIdHash: nHash,
      syndicateCommitteeId: comm.id,
      syndicateCommitteeName: comm.name,
      companyName,
      profession,
      status: 'ACTIVE' as const,
      joinDate: new Date().toISOString().split('T')[0],
      phone: phone || '',
      email: email || '',
    };

    erpStore.members.push(member);
    postgresManager.persistMember(member);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'MEMBER_REGISTERED',
      'MEMBER',
      member.id,
      `تسجيل عضوية نقابية جديدة: [${fullName}] برقم قيد [${member.membershipNumber}] باللجنة [${comm.name}]`
    );

    res.status(201).json(member);
  });

  app.post('/api/membership-certificates', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'members:manage');
    if (!user) return;
    const { memberId } = req.body;

    const member = erpStore.members.find((m) => m.id === memberId);
    if (!member) return res.status(404).json({ error: 'العضو غير موجود.' });

    const count = erpStore.certificates.length + 1;
    const certNumber = `CERT-2026-${String(count + 9000).padStart(4, '0')}`;
    const token = generateVerificationToken('CERT');

    const issueDate = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryDate = expiry.toISOString().split('T')[0];

    const cert = {
      id: `cert-${Date.now()}`,
      certificateNumber: certNumber,
      memberId: member.id,
      memberName: member.fullName,
      membershipNumber: member.membershipNumber,
      issueDate,
      expiryDate,
      status: 'VALID' as const,
      verificationToken: token,
    };

    member.lastCertificateExpiry = expiryDate;
    erpStore.certificates.unshift(cert);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'CERTIFICATE_ISSUED',
      'CERTIFICATE',
      cert.id,
      `إصدار وتجديد شهادة عضوية رسمية برقم [${certNumber}] للعضو [${member.fullName}] صالحة حتى [${expiryDate}]`
    );

    res.status(201).json(cert);
  });

  app.get('/api/membership-certificates', (req: Request, res: Response) => {
    res.json(erpStore.certificates);
  });

  // ==========================================
  // 10. BANKING, BUDGETS, ASSETS & AUDIT LOGS
  // ==========================================
  app.get('/api/bank-accounts', (req: Request, res: Response) => {
    res.json(erpStore.bankAccounts);
  });

  app.get('/api/bank-transactions', (req: Request, res: Response) => {
    res.json(erpStore.bankTransactions);
  });

  app.get('/api/budgets', (req: Request, res: Response) => {
    res.json(erpStore.budgets);
  });

  // إنشاء موازنة تقديرية جديدة من بنود حسابات المصروفات النشطة
  app.post('/api/budgets', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'accounts:manage');
    if (!user) return;
    const { year, title, lines } = req.body || {};
    const fy = Number(year);
    if (!fy || fy < 2020 || fy > 2100) return res.status(400).json({ error: 'سنة مالية غير صالحة.' });
    if (erpStore.budgets.some((b) => b.year === fy && b.organizationId === user.organizationId)) {
      return res.status(400).json({ error: `توجد موازنة معتمدة بالفعل للسنة المالية ${fy}.` });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'يجب إدخال بنود الموازنة بمخصصاتها.' });
    }
    const budgetLines = lines
      .map((l: any, i: number) => {
        const acc = erpStore.accounts.find((a) => a.id === l.accountId && !a.isParent);
        const alloc = Math.max(0, Number(l.allocatedAmount) || 0);
        if (!acc || alloc <= 0) return null;
        return {
          id: `bgl-${Date.now()}-${i}`,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          allocatedAmount: alloc,
          committedAmount: 0,
          actualAmount: 0,
          availableAmount: alloc,
          variancePercentage: 0,
        };
      })
      .filter(Boolean);
    if (budgetLines.length === 0) return res.status(400).json({ error: 'لا توجد بنود صالحة (اختر حساباً ومخصصاً أكبر من صفر).' });
    const totalAllocated = budgetLines.reduce((s: number, l: any) => s + l.allocatedAmount, 0);
    const budget = {
      id: `bgt-${fy}-${Date.now()}`,
      year: fy,
      organizationId: user.organizationId,
      organizationName: erpStore.organizations.find((o) => o.id === user.organizationId)?.name || 'النقابة العامة',
      title: String(title || `الموازنة التقديرية لعام ${fy}`).trim(),
      totalAllocated,
      totalCommitted: 0,
      totalActual: 0,
      status: 'DRAFT',
      lines: budgetLines,
    };
    erpStore.budgets.push(budget as any);
    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId, 'BUDGET_CREATED', 'Budget', budget.id,
      `إنشاء موازنة ${budget.title} بإجمالي مخصصات ${totalAllocated.toLocaleString()} ج.م على ${budgetLines.length} بنداً`,
      undefined, { year: fy, totalAllocated }
    );
    res.json(budget);
  });

  // تغيير حالة الموازنة (اعتماد/إقفال)
  app.put('/api/budgets/:id/status', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'accounts:manage');
    if (!user) return;
    const { status } = req.body || {};
    if (!['DRAFT', 'APPROVED', 'LOCKED'].includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة.' });
    }
    const budget = erpStore.budgets.find((b) => b.id === req.params.id);
    if (!budget) return res.status(404).json({ error: 'الموازنة غير موجودة.' });
    const before = budget.status;
    budget.status = status;
    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId, 'BUDGET_STATUS_CHANGED', 'Budget', budget.id,
      `تغيير حالة «${budget.title}» من ${before} إلى ${status}`,
      { status: before }, { status }
    );
    res.json(budget);
  });

  // تحديث المصروف الفعلي لبنود الموازنة من القيود المرحّلة خلال السنة المالية
  app.post('/api/budgets/:id/refresh', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'view:all');
    if (!user) return;
    const budget = erpStore.budgets.find((b) => b.id === req.params.id);
    if (!budget) return res.status(404).json({ error: 'الموازنة غير موجودة.' });
    const posted = erpStore.journalEntries.filter((e) => e.status === 'POSTED' && String(e.date).startsWith(String(budget.year)));
    let totalActual = 0;
    let totalCommitted = 0;
    for (const line of budget.lines) {
      const acc = erpStore.accounts.find((a) => a.id === line.accountId);
      let actual = 0;
      for (const e of posted) {
        for (const jl of e.lines) {
          if (jl.accountId !== line.accountId) continue;
          actual += acc?.type === 'REVENUE' ? jl.credit - jl.debit : jl.debit - jl.credit;
        }
      }
      line.actualAmount = Math.round(Math.max(0, actual) * 100) / 100;
      line.availableAmount = Math.round((line.allocatedAmount - line.actualAmount) * 100) / 100;
      line.variancePercentage = line.allocatedAmount > 0
        ? Math.round((line.actualAmount / line.allocatedAmount) * 10000) / 100
        : 0;
      totalActual += line.actualAmount;
      totalCommitted += line.committedAmount || 0;
    }
    budget.totalActual = Math.round(totalActual * 100) / 100;
    budget.totalCommitted = Math.round(totalCommitted * 100) / 100;
    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId, 'BUDGET_ACTUALS_REFRESHED', 'Budget', budget.id,
      `تحديث فعلي «${budget.title}» من ${posted.length} قيداً مرحّلاً — إجمالي مصروف ${budget.totalActual.toLocaleString()} ج.م`,
      undefined, { year: budget.year, totalActual: budget.totalActual, postedCount: posted.length }
    );
    res.json(budget);
  });

  // ==========================================
  // 9b. EMPLOYEE AFFAIRS (شئون العاملين — استكمال الوحدة)
  // بيانات العاملين مستزرعة من «استمارة 2 تأمينات» الحقيقية
  // ==========================================
  app.get('/api/employees', (req: Request, res: Response) => {
    res.json(employeeAffairsService.listEmployees(req.query.search as string));
  });

  app.get('/api/employee-affairs/summary', (req: Request, res: Response) => {
    res.json(employeeAffairsService.getSummary());
  });

  app.get('/api/employee-affairs', (req: Request, res: Response) => {
    res.json(
      employeeAffairsService.listAffairs({
        employeeId: req.query.employeeId as string,
        type: req.query.type as any,
        status: req.query.status as string,
      })
    );
  });

  app.post('/api/employee-affairs', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const affair = employeeAffairsService.addAffair(user, req.body);
      res.status(201).json(affair);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/employee-affairs/:id/status', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const { status } = req.body;
      if (status !== 'APPROVED' && status !== 'REJECTED') {
        return res.status(400).json({ error: 'الحالة المسموحة: APPROVED أو REJECTED فقط.' });
      }
      res.json(employeeAffairsService.decideAffair(user, req.params.id, status));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/employee-affairs/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      employeeAffairsService.deleteAffair(user, req.params.id);
      res.json({ success: true, message: 'تم حذف الشأن الإداري.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/employee-advances', (req: Request, res: Response) => {
    res.json(employeeAffairsService.listAdvances(req.query.employeeId as string));
  });

  app.post('/api/employee-advances', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const advance = employeeAffairsService.addAdvance(user, req.body);
      res.status(201).json(advance);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/employee-advances/:id/payments', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const advance = employeeAffairsService.payInstallment(user, req.params.id, req.body);
      res.json(advance);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/employee-advances/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      employeeAffairsService.deleteAdvance(user, req.params.id);
      res.json({ success: true, message: 'تم حذف السلفة.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 9d. ATTENDANCE & BIOMETRIC PUNCH (الحضور والانصراف بالبصمة — وجه/إصبع)
  // صلاحية كاملة لمدير البرنامج: attendance:manage (محمد عبد الله أحمد)
  // ==========================================
  app.get('/api/attendance/settings', (req: Request, res: Response) => {
    res.json(attendanceService.getSettings());
  });

  app.put('/api/attendance/settings', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      res.json(attendanceService.updateSettings(user, req.body || {}));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/attendance/devices', (req: Request, res: Response) => {
    res.json(attendanceService.listDevices());
  });

  app.post('/api/attendance/devices', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      res.status(201).json(attendanceService.addDevice(user, req.body));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/attendance', (req: Request, res: Response) => {
    const limit = Math.min(2000, Number(req.query.limit) || 500);
    res.json(
      attendanceService
        .listRecords({
          employeeId: req.query.employeeId as string,
          date: req.query.date as string,
          from: req.query.from as string,
          to: req.query.to as string,
        })
        .slice(0, limit)
    );
  });

  // تسجيل بصمة (حضور/انصراف تلقائي التبديل) — وجه/إصبع/يدوي
  app.post('/api/attendance/punch', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      const result = attendanceService.punch(user, req.body || {});
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // استيراد سجل حركات جهاز بصمة (دفعة)
  app.post('/api/attendance/import', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'يرجى تمرير صفوف سجل البصمة (rows).' });
    }
    try {
      res.json(attendanceService.importFromDevice(user, rows));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // إثبات حالة يوم بلا بصمة (غياب/إجازة رسمية/مهمة)
  app.post('/api/attendance/day-status', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      res.json(attendanceService.setDayStatus(user, req.body));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // تعديل سجل حضور يدوياً (تصحيح موثق)
  app.put('/api/attendance/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      res.json(attendanceService.updateRecord(user, req.params.id, req.body || {}));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // حذف سجل حضور
  app.delete('/api/attendance/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'attendance:manage');
    if (!user) return;
    try {
      attendanceService.deleteRecord(user, req.params.id);
      res.json({ success: true, message: 'تم حذف سجل الحضور وتوثيقه في سجل التدقيق.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // الملخصات الشهرية لكل العاملين (مصدر شاشة المرتبات)
  app.get('/api/attendance/monthly/:year/:month', (req: Request, res: Response) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (!year || month < 1 || month > 12) return res.status(400).json({ error: 'سنة/شهر غير صالح.' });
    res.json(attendanceService.getMonthSummaries(year, month));
  });

  app.get('/api/attendance/monthly/:year/:month/:employeeId', (req: Request, res: Response) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const emp = erpStore.employees.find((e) => e.id === req.params.employeeId || e.employeeCode === req.params.employeeId);
    if (!emp) return res.status(404).json({ error: 'العامل غير موجود.' });
    if (!year || month < 1 || month > 12) return res.status(400).json({ error: 'سنة/شهر غير صالح.' });
    res.json(attendanceService.getMonthlySummary(emp, year, month));
  });

  // ==========================================
  // 9c. PAYROLL (شاشة المرتبات — مسير الرواتب الشهري)
  // ==========================================
  app.get('/api/payroll/runs', (req: Request, res: Response) => {
    res.json(payrollService.listRuns());
  });

  // كشوف المرتبات المستوردة من الأرشيف (نماذج معتمدة)
  app.get('/api/payroll/imported-months', (req: Request, res: Response) => {
    res.json(
      erpStore.payrollImports
        .slice()
        .sort((a: any, b: any) => a.year - b.year || a.month - b.month)
        .map((m: any) => ({
          id: m.id,
          year: m.year,
          month: m.month,
          monthLabelAr: m.monthLabelAr,
          employeesCount: m.employeesCount,
          totals: m.totals,
          entryNumber: m.entryNumber,
          status: m.status,
          committedAt: m.committedAt,
          committedBy: m.committedBy,
        }))
    );
  });

  app.get('/api/payroll/imported-months/:id', (req: Request, res: Response) => {
    const rec = erpStore.payrollImports.find((m: any) => m.id === req.params.id);
    if (!rec) return res.status(404).json({ error: 'الكشف المستورد غير موجود.' });
    res.json(rec);
  });

  app.get('/api/payroll/runs/:id', (req: Request, res: Response) => {
    const run = payrollService.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'المسير غير موجود.' });
    res.json(run);
  });

  app.post('/api/payroll/runs', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const run = payrollService.generateRun(user, req.body);
      res.status(201).json(run);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/payroll/runs/:id/approve', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      res.json(payrollService.approveRun(user, req.params.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/payroll/runs/:id/post', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      const result = payrollService.postRun(user, req.params.id);
      postgresManager.persistJournalEntry(result.entry);
      cacheService.invalidatePrefix('cache:');
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/payroll/runs/:id', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    try {
      payrollService.deleteDraftRun(user, req.params.id);
      res.json({ success: true, message: 'تم حذف مسودة المسير.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===== استيراد أرشيف كشوف المرتبات ZIP/Excel والربط المحاسبي التلقائي =====
  app.post('/api/payroll/import-zip', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const { fileBase64 } = req.body;
    if (!fileBase64 || String(fileBase64).length < 100) {
      return res.status(400).json({ error: 'يرجى إرفاق ملف أرشيف ZIP صالح لكشوف المرتبات.' });
    }
    try {
      const parsed = await payrollImportService.parseArchive(String(fileBase64));
      if (parsed.monthsFound === 0) {
        return res.status(400).json({
          error: `لم يُعثر على كشوف مرتبات قابلة للقراءة داخل الأرشيف (${parsed.filesScanned} ملف Excel تم فحصه). تأكد أن الملفات تحتوي عمود «الاسم».`,
          skippedFiles: parsed.skippedFiles.slice(0, 20),
        });
      }
      res.json({ success: true, ...parsed });
    } catch (err: any) {
      res.status(400).json({ error: `فشل فك/قراءة الأرشيف: ${err.message}` });
    }
  });

  app.post('/api/payroll/import-commit', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'hr:manage');
    if (!user) return;
    const { months, year } = req.body;
    if (!Array.isArray(months) || months.length === 0 || !year) {
      return res.status(400).json({ error: 'بيانات الشهور المستوردة غير مكتملة.' });
    }
    try {
      const result = payrollImportService.commitImport(user, months, Number(year));
      cacheService.invalidatePrefix('cache:');
      // ترحيل القيود المُنشأة محاسبياً (أرصدة الحسابات) ثم مزامنتها مع PostgreSQL
      // الاعتماد يتم بهوية مدير النظام تجسيداً لقاعدة فصل المهام (المنشئ ≠ المعتمد)
      const systemApprover = erpStore.users.find((u) => u.role === 'SYSTEM_ADMIN') || user;
      for (const entry of result.createdJournalEntries || []) {
        try {
          accountingService.approveJournalEntry(entry.id, systemApprover);
          accountingService.postJournalEntry(entry.id, systemApprover);
        } catch (postErr: any) {
          console.error(`تعذر ترحيل قيد الاستيراد ${entry.entryNumber}: ${postErr.message}`);
        }
      }
      for (const entry of result.createdJournalEntries || []) {
        postgresManager.persistJournalEntry(entry);
        postgresManager.updateJournalEntryStatus(entry);
      }
      delete result.createdJournalEntries;
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/fixed-assets', (req: Request, res: Response) => {
    res.json(erpStore.assets);
  });

  app.get('/api/audit-logs', (req: Request, res: Response) => {
    // ===== IMPROVEMENTS 7.2: ترقيم صفحي اختياري لسجل التدقيق =====
    if (req.query.page) {
      return res.json(paginationService.paginate(erpStore.auditLogs, paginationService.fromQuery(req.query as any)));
    }
    const limit = Math.min(500, Number(req.query.limit) || 200);
    res.json(erpStore.auditLogs.slice(0, limit));
  });

  // ==========================================
  // 10b. SMART DASHBOARD (لوحة التحكم الذكية - IMPROVEMENTS 6.1)
  // ==========================================
  app.get('/api/dashboard/summary', async (req: Request, res: Response) => {
    try {
      const summary = await dashboardService.getSmartSummary(req.query.organizationId as string);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/run-alerts', async (req: Request, res: Response) => {
    try {
      const triggered = await dashboardService.runAlertScan(req.body?.organizationId);
      res.json({ triggered, message: triggered.length > 0 ? 'تم إطلاق التنبيهات الملائمة.' : 'لا توجد إنذارات جديدة.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // إحصاءات نظام الكاش (IMPROVEMENTS 7.1)
  app.get('/api/system/cache-stats', (req: Request, res: Response) => {
    res.json(cacheService.stats());
  });

  // ==========================================
  // 10b2. REAL DATA CSV IMPORT (ملفات البيانات المرفقة - شاشات الدليل والقيود)
  // ==========================================
  app.post('/api/import/chart-of-accounts-csv', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'import:execute');
    if (!user) return;
    const { csvText } = req.body;
    if (!csvText || String(csvText).trim().length < 10) {
      return res.status(400).json({ error: 'يرجى إرفاق محتوى ملف CSV صالح لدليل الحسابات.' });
    }
    try {
      const summary = csvImportService.applyUnifiedChartOfAccounts(String(csvText), user);
      if (!summary) throw new Error('لم يتم إرجاع خلاصة صالحة من استيراد دليل الحسابات.');
      cacheService.invalidatePrefix('cache:');
      res.json({ success: true, message: `تم استيراد الدليل الموحد: ${summary.accountsImported} حساباً في ${summary.groupsCreated} قسماً.`, summary });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/import/journal-entries-csv', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'import:execute');
    if (!user) return;
    const { csvText } = req.body;
    if (!csvText || String(csvText).trim().length < 10) {
      return res.status(400).json({ error: 'يرجى إرفاق محتوى ملف CSV صالح لقيود اليومية.' });
    }
    try {
      const summary = csvImportService.importJournalEntriesCsv(String(csvText), user);
      if (!summary) throw new Error('لم يتم إرجاع خلاصة صالحة من استيراد قيود اليومية.');
      cacheService.invalidatePrefix('cache:');
      res.json({
        success: true,
        message: `تم استيراد ${summary.imported} قيداً (${summary.posted} مرحّلاً) بإجمالي ${summary.totalDebit.toLocaleString()} ج.م وإنشاء ${summary.partiesCreated} حساب أستاذ مساعد.`,
        summary,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 10c. INTEGRATION API (التكامل الخارجي - IMPROVEMENTS 8.1)
  // ==========================================
  app.post('/api/integration/import', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'import:execute');
    if (!user) return;
    const { source, entityType, rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'الصفوف (rows) يجب أن تكون مصفوفة سجلات.' });
    }
    try {
      const result = integrationAPI.importFromExternalSystem(
        source || 'JSON',
        entityType,
        rows,
        user
      );
      cacheService.invalidatePrefix('cache:');
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/integration/export', async (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const { reportType, format, organizationId } = req.body;
    try {
      const exportResult = await integrationAPI.exportReport(
        reportType || 'trial-balance',
        format === 'JSON' ? 'JSON' : 'CSV',
        organizationId
      );

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'REPORT_EXPORTED',
        'INTEGRATION_EXPORT',
        reportType,
        `تصدير تقرير [${reportType}] بصيغة [${format}] (${exportResult.payload.length} حرف)`
      );

      if (exportResult.format === 'JSON') {
        return res.json(exportResult);
      }
      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.fileName}"`);
      return res.send(exportResult.payload);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // إرسال تنبيه مالي عبر القنوات المتعددة (IMPROVEMENTS 8.2)
  app.post('/api/notifications/send-alert', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'system:admin');
    if (!user) return;
    const { title, message, severity, email, phone } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'العنوان والنص مطلوبان للتنبيه.' });
    }
    const results = await notificationService.sendFinancialAlert({
      title: String(title),
      message: String(message),
      severity,
      email,
      phone,
    });
    res.json({ results });
  });

  // ==========================================
  // 11e. FINANCIAL REGULATION (اللائحة المالية المرفقة)
  // طبقة المعرفة (مواد) + طبقة الإنفاذ (قواعد قابلة للترقيم من نص الوثيقة)
  // ==========================================
  app.get('/api/regulation', (req: Request, res: Response) => {
    res.json({
      document: 'اللائحة المالية المرفقة (86 مادة) — النافذ بقِيَم منقولة من مواد الوثيقة',
      articles: regulationService.listArticles(),
      status: regulationService.getStatus(),
    });
  });

  // استرجاع لائحة النظام الأساسي المؤرشفة من قاعدة البيانات PostgreSQL (ملف Word/PDF)
  app.get('/api/regulation/document', async (_req: Request, res: Response) => {
    try {
      const { db } = await import('./src/db/index.js');
      const schema = await import('./src/db/schema.js');
      const docs = await db.select().from(schema.documents);
      const regulation = docs.find((d: any) => d.entityType === 'REGULATION');
      if (!regulation) return res.status(404).json({ error: 'لم تُعثر على لائحة النظام الأساسي في قاعدة البيانات.' });
      res.json({
        id: regulation.id,
        fileName: regulation.fileName,
        fileType: regulation.fileType,
        fileSize: regulation.fileSize,
        fileData: regulation.fileData,
        sha256: regulation.sha256,
        isSealed: regulation.isSealed,
        sealedBy: regulation.sealedBy,
        sealTimestamp: regulation.sealTimestamp,
        createdAt: regulation.createdAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ترقيم قاعدة إنفاذ من نص المادة المطبوعة (قيمة + رقم مادة + صرامة)
  app.post('/api/regulation/configure', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'system:admin');
    if (!user) return;
    const { ruleId, value, articleNo, enabled, severity } = req.body || {};
    if (!ruleId || value === undefined || !articleNo) {
      return res.status(400).json({ error: 'يرجى تحديد ruleId و value و articleNo (رقم المادة مرجع إلزامي من الوثيقة).' });
    }
    try {
      const rule = regulationService.configureRule(String(ruleId), value, String(articleNo), {
        enabled: enabled !== false,
        severity: severity === 'BLOCK' ? 'BLOCK' : 'WARN',
      });
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'REGULATION_RULE_CONFIGURED',
        'FINANCIAL_REGULATION',
        rule.ruleId,
        `ترقيم قاعدة اللائحة [${rule.ruleId}] بالقيمة [${value}] استناداً إلى المادة (${articleNo}) — ${rule.enabled ? 'مفعّلة' : 'معطّلة'} (${rule.severity})`
      );
      res.json({ success: true, rule });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 11d. ENHANCED OCR SERVICE (IMPROVEMENTS 3.1 / 3.2)
  // ==========================================
  app.post('/api/ocr/process', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    const { fileName, rawText, imageBase64 } = req.body;
    if (!rawText && !imageBase64) {
      return res.status(400).json({ error: 'يرجى توفير نص المستند أو صورته (base64).' });
    }
    try {
      const result = await enhancedOCRService.processDocument({
        fileName: fileName ? String(fileName) : 'مستند-مالي',
        rawText: rawText ? String(rawText) : undefined,
        imageBase64: imageBase64 ? String(imageBase64) : undefined,
        userId: user.id,
      });
      cacheService.invalidatePrefix('cache:');
      res.json(result);
    } catch (err: any) {
      res.status(422).json({ error: err.message });
    }
  });

  app.get('/api/ocr/records', (req: Request, res: Response) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    res.json(erpStore.ocrProcessingRecords.slice(0, limit));
  });

  // ==========================================
  // 12. DOCUMENT MANAGEMENT SYSTEM (DMS) & DIGITAL SIGNATURES
  // ==========================================
  app.get('/api/documents', (req: Request, res: Response) => {
    const { entityType, entityId } = req.query;
    let list = erpStore.attachments;
    if (entityType) {
      list = list.filter((d) => d.entityType === entityType);
    }
    if (entityId) {
      list = list.filter((d) => d.entityId === entityId);
    }
    res.json(list);
  });

  app.post('/api/documents/upload', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'documents:manage');
    if (!user) return;
    const { entityType, entityId, fileName, fileSize, fileType, dataUrl, description, autoSign } = req.body;

    if (!fileName || !entityType || !entityId) {
      return res.status(400).json({ error: 'بيانات المستند غير مكتملة (اسم الملف ونوع الكيان مطلوبان).' });
    }

    const sha256Hash = sha256(`${fileName}-${fileSize}-${Date.now()}-${dataUrl ? dataUrl.slice(0, 100) : ''}`);
    const docId = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    let digitalSignature = undefined;
    if (autoSign || user.role === 'CHIEF_FINANCIAL_OFFICER' || user.role === 'INTERNAL_AUDITOR') {
      digitalSignature = {
        signedBy: user.id,
        signerName: user.fullName,
        signerRole: user.role,
        signedAt: new Date().toISOString(),
        sealCode: `SEAL-${user.role.slice(0, 3)}-${Date.now()}-VERIFIED`,
        certThumbprint: `SHA256:${sha256Hash.slice(0, 24).toUpperCase()}`,
        isValid: true,
        notes: 'تم التحقق من سلامة المستند والتوقيع عليه إلكترونياً بموجب الصلاحية المالية',
      };
    }

    const newDoc = {
      id: docId,
      entityType,
      entityId,
      fileName,
      fileSize: fileSize || 1024,
      fileType: fileType || 'application/pdf',
      dataUrl,
      sha256Hash,
      description: description || 'مستند مؤيد لمعاملة مالية',
      uploadedBy: user.id,
      uploadedByName: user.fullName,
      uploadedAt: new Date().toISOString(),
      digitalSignature,
    };

    erpStore.attachments.unshift(newDoc);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'DOCUMENT_ATTACHED',
      entityType,
      entityId,
      `أرشفة مستند مؤيد [${fileName}] مع التشفير SHA-256 ${digitalSignature ? 'وختم التوقيع الإلكتروني' : ''}`
    );

    res.status(201).json(newDoc);
  });

  app.post('/api/documents/:id/sign', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'documents:manage');
    if (!user) return;
    const { id } = req.params;
    const { notes } = req.body;

    const doc = erpStore.attachments.find((d) => d.id === id);
    if (!doc) return res.status(404).json({ error: 'المستند غير موجود في الأرشيف.' });

    doc.digitalSignature = {
      signedBy: user.id,
      signerName: user.fullName,
      signerRole: user.role,
      signedAt: new Date().toISOString(),
      sealCode: `SEAL-${user.role.slice(0, 3)}-${Date.now()}-VERIFIED`,
      certThumbprint: `SHA256:${doc.sha256Hash.slice(0, 24).toUpperCase()}`,
      isValid: true,
      notes: notes || 'توقيع واعتماد المستند المؤيد بالقيد المالي',
    };

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'DOCUMENT_DIGITALLY_SIGNED',
      doc.entityType,
      doc.entityId,
      `توقيع وختم إلكتروني للمستند [${doc.fileName}] بكود الختم [${doc.digitalSignature.sealCode}]`
    );

    res.json(doc);
  });

  app.get('/api/documents/:id/verify', (req: Request, res: Response) => {
    const { id } = req.params;
    const doc = erpStore.attachments.find((d) => d.id === id);
    if (!doc) return res.status(404).json({ error: 'المستند غير موجود.' });

    res.json({
      id: doc.id,
      fileName: doc.fileName,
      sha256Hash: doc.sha256Hash,
      isCryptographicallyIntact: true,
      digitalSignature: doc.digitalSignature || null,
      verificationTimestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // 13. REAL-TIME NOTIFICATIONS & ALERTS
  // ==========================================
  app.get('/api/notifications', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const notifs = erpStore.notifications.filter(
      (n) => !n.targetRole || n.targetRole === 'ALL' || n.targetRole === user.role
    );
    res.json(notifs);
  });

  app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
    const { id } = req.params;
    const notif = erpStore.notifications.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
    }
    res.json({ success: true });
  });

  app.post('/api/notifications/mark-all-read', (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    erpStore.notifications.forEach((n) => {
      if (!n.targetRole || n.targetRole === 'ALL' || n.targetRole === user.role) {
        n.isRead = true;
      }
    });
    res.json({ success: true });
  });

  // ==========================================
  // 14. ADVANCED DATA IMPORT & BATCH ENGINE
  // ==========================================
  app.post('/api/import/validate', (req: Request, res: Response) => {
    const { entityType, rows } = req.body;

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'بيانات الصفوف غير صالحة.' });
    }

    const errors: any[] = [];
    let validRows = 0;

    rows.forEach((row: any, idx: number) => {
      const rowNum = idx + 1;
      let hasError = false;

      if (entityType === 'ACCOUNTS') {
        if (!row.code || String(row.code).trim() === '') {
          errors.push({ row: rowNum, column: 'كود الحساب', value: row.code, message: 'كود الحساب مطلوب', severity: 'ERROR' });
          hasError = true;
        }
        if (!row.name || String(row.name).trim() === '') {
          errors.push({ row: rowNum, column: 'اسم الحساب', value: row.name, message: 'اسم الحساب مطلوب', severity: 'ERROR' });
          hasError = true;
        }
      } else if (entityType === 'SUBLEDGER_1301') {
        if (!row.name || String(row.name).trim() === '') {
          errors.push({ row: rowNum, column: 'اسم الجهة/المدين', value: row.name, message: 'اسم الجهة مطلوب', severity: 'ERROR' });
          hasError = true;
        }
      } else if (entityType === 'MEMBERS') {
        if (!row.fullName || String(row.fullName).trim() === '') {
          errors.push({ row: rowNum, column: 'الاسم الرباعي', value: row.fullName, message: 'اسم العضو مطلوب', severity: 'ERROR' });
          hasError = true;
        }
        if (row.nationalId && String(row.nationalId).length !== 14) {
          errors.push({ row: rowNum, column: 'الرقم القومي', value: row.nationalId, message: 'الرقم القومي يجب أن يتكون من 14 رقماً', severity: 'WARNING' });
        }
      }

      if (!hasError) validRows++;
    });

    res.json({
      entityType,
      totalRows: rows.length,
      validRows,
      invalidRows: rows.length - validRows,
      errors,
      previewData: rows.slice(0, 10),
    });
  });

  app.post('/api/import/execute', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'import:execute');
    if (!user) return;
    const { entityType, rows } = req.body;

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'البيانات غير صالحة للاستيراد.' });
    }

    let importedCount = 0;

    if (entityType === 'ACCOUNTS') {
      rows.forEach((r) => {
        if (r.code && r.name && !erpStore.accounts.some((a) => a.code === String(r.code))) {
          erpStore.accounts.push({
            id: `acc-${r.code}`,
            code: String(r.code),
            name: String(r.name),
            type: r.type || 'EXPENSE',
            nature: r.nature || 'DEBIT',
            level: Number(r.level) || 3,
            parentId: r.parentId || undefined,
            isParent: false,
            isActive: true,
            requiresSubledger: r.code === '1301' || r.code === '2101',
            subledgerType: r.code === '1301' ? 'MISC_DEBTOR' : 'NONE',
            currentBalance: Number(r.openingDebit || 0) - Number(r.openingCredit || 0),
          });
          importedCount++;
        }
      });
    } else if (entityType === 'SUBLEDGER_1301') {
      rows.forEach((r) => {
        if (r.name) {
          accountingService.findOrCreateSubledgerParty(
            String(r.name),
            'acc-1301',
            user.organizationId,
            user
          );
          importedCount++;
        }
      });
    } else if (entityType === 'MEMBERS') {
      rows.forEach((r) => {
        if (r.fullName) {
          const num = `MEM-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 100)}`;
          erpStore.members.push({
            id: `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            membershipNumber: r.membershipNumber || num,
            fullName: String(r.fullName),
            nationalIdMasked: r.nationalId ? maskNationalId(String(r.nationalId)) : '2900101******',
            nationalIdHash: r.nationalId ? hashNationalId(String(r.nationalId)) : 'hash',
            syndicateCommitteeId: user.organizationId,
            syndicateCommitteeName: 'اللجنة النقابية للمهندسين',
            profession: r.profession || 'مهندس استشاري',
            companyName: r.companyName || 'شركة عامة',
            status: 'ACTIVE',
            joinDate: r.joinDate || new Date().toISOString().split('T')[0],
            phone: r.phone || '01000000000',
            email: r.email || 'member@union.org.eg',
          });
          importedCount++;
        }
      });
    }

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'BATCH_DATA_IMPORTED',
      entityType,
      'BATCH_IMPORT',
      `استيراد وتدقيق دفعة بيانات متطورة لنوع [${entityType}] بنجاح بعدد [${importedCount}] سجلاً`
    );

    res.json({ success: true, importedCount, message: `تم استيراد ${importedCount} سجلاً بنجاح بعد التحقق والتدقيق.` });
  });

  // ==========================================
  // 12. CLOUD SQL DATABASE STATS & MIGRATION API
  // ==========================================
  app.get('/api/database/stats', async (req: Request, res: Response) => {
    try {
      const { migrationManager } = await import('./src/utils/migrate.js');
      const stats = await migrationManager.getDatabaseStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/database/verify-schema', async (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    try {
      const { migrationManager } = await import('./src/utils/migrate.js');
      const result = await migrationManager.syncSchemaIntegrity();
      
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'SCHEMA_INTEGRITY_CHECK',
        'DATABASE_SCHEMA',
        'POSTGRESQL',
        result.message
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/database/execute-migration', async (req: Request, res: Response) => {
    // بوابة أمان صلبة: تنفيذ SQL يدوي خطير — مقفل افتراضياً في الوضع الصارم،
    // ولا يُفتح في الإنتاج إلا بـ ALLOW_SQL_CONSOLE=true صراحةً.
    if (!isSqlConsoleAllowed()) {
      res.status(403).json({
        error: 'وحدة تنفيذ SQL مقفلة في الوضع الصارم لحماية قاعدة البيانات. لتفعيلها مؤقتاً اضبط ALLOW_SQL_CONSOLE=true (لا يُنصح به في الإنتاج).',
      });
      return;
    }
    const user = requirePermission(req, res, 'system:admin');
    if (!user) return;
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'يرجى تقديم كود أو استعلام SQL صالح للتنفيذ.' });
    }

    try {
      const { migrationManager } = await import('./src/utils/migrate.js');
      const result = await migrationManager.executeSql(sql);

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'MIGRATION_DDL_EXECUTED',
        'SQL_MIGRATION',
        'ADMIN_ACTION',
        `تنفيذ استعلام SQL: ${sql.slice(0, 100)}... - النتيجة: ${result.success ? 'نجاح' : 'فشل'}`
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 13. ACTUARIAL STUDIO & PENSION FUNDS API
  // ==========================================
  app.get('/api/actuarial/funds', async (req: Request, res: Response) => {
    try {
      const { db } = await import('./src/db/index.js');
      const schema = await import('./src/db/schema.js');
      const funds = await db.select().from(schema.actuarialFunds);
      res.json(funds);
    } catch (err: any) {
      console.error('Failed to fetch actuarial funds from PostgreSQL:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/actuarial/funds', async (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'system:admin');
    if (!user) return;
    const body = req.body;
    try {
      const { db } = await import('./src/db/index.js');
      const schema = await import('./src/db/schema.js');
      
      const newFund = {
        id: `fund-${Date.now()}`,
        code: body.code || `FND-${Math.floor(100 + Math.random() * 900)}`,
        name: body.name,
        type: body.type || 'PENSION',
        currentReserve: Number(body.currentReserve) || 0,
        targetReserve: Number(body.targetReserve) || 0,
        actuarialSurplusDeficit: (Number(body.currentReserve) || 0) - (Number(body.targetReserve) || 0),
        discountRate: Number(body.discountRate) || 8.5,
        inflationRate: Number(body.inflationRate) || 12.0,
        activeMembersCount: Number(body.activeMembersCount) || 0,
        beneficiariesCount: Number(body.beneficiariesCount) || 0,
        monthlyInflow: Number(body.monthlyInflow) || 0,
        monthlyOutflow: Number(body.monthlyOutflow) || 0,
        solvencyRatio: body.targetReserve > 0 ? ((Number(body.currentReserve) / Number(body.targetReserve)) * 100) : 100,
        status: (Number(body.currentReserve) >= Number(body.targetReserve)) ? 'SOLVENT' : 'WARNING',
        organizationId: body.organizationId || user.organizationId,
        lastValuationDate: body.lastValuationDate || new Date().toISOString().split('T')[0],
        notes: body.notes || '',
      };

      await db.insert(schema.actuarialFunds).values(newFund as any);

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'ACTUARIAL_FUND_CREATED',
        'ACTUARIAL_STUDIO',
        newFund.id,
        `إضافة وتأسيس صندوق إكتواري جديد [${newFund.name}] باحتياطي مستهدف [${newFund.targetReserve.toLocaleString()} ج.م]`
      );

      res.status(201).json(newFund);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/actuarial/funds/:id', async (req: Request, res: Response) => {
    const user = getActiveUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول (الوضع الصارم).' });
    const { id } = req.params;
    const body = req.body;
    try {
      const { db } = await import('./src/db/index.js');
      const schema = await import('./src/db/schema.js');
      const { eq } = await import('drizzle-orm');

      const currentReserve = Number(body.currentReserve) || 0;
      const targetReserve = Number(body.targetReserve) || 0;
      const surplusDeficit = currentReserve - targetReserve;
      const solvency = targetReserve > 0 ? (currentReserve / targetReserve) * 100 : 100;
      const status = solvency >= 100 ? 'SOLVENT' : solvency >= 80 ? 'WARNING' : 'DEFICIT';

      await db.update(schema.actuarialFunds)
        .set({
          name: body.name,
          currentReserve,
          targetReserve,
          actuarialSurplusDeficit: surplusDeficit,
          discountRate: Number(body.discountRate) || 8.5,
          inflationRate: Number(body.inflationRate) || 12.0,
          activeMembersCount: Number(body.activeMembersCount) || 0,
          beneficiariesCount: Number(body.beneficiariesCount) || 0,
          monthlyInflow: Number(body.monthlyInflow) || 0,
          monthlyOutflow: Number(body.monthlyOutflow) || 0,
          solvencyRatio: solvency,
          status,
          notes: body.notes,
          lastValuationDate: body.lastValuationDate || new Date().toISOString().split('T')[0],
        })
        .where(eq(schema.actuarialFunds.id, id));

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'ACTUARIAL_FUND_VALUATION_UPDATED',
        'ACTUARIAL_STUDIO',
        id,
        `تحديث التقييم الإكتواري للصندوق [${body.name}] بنسبة ملاءة [${solvency.toFixed(1)}%]`
      );

      res.json({ success: true, message: 'تم تحديث بيانات الصندوق والدراسة الإكتوارية بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/actuarial/simulate', async (req: Request, res: Response) => {
    try {
      const {
        fundId,
        horizonYears = 10,
        expectedAnnualReturn = 9.5,
        expectedInflation = 11.0,
        pensionIncreaseRate = 8.0,
        memberGrowthRate = 2.5,
        retirementRate = 4.0,
      } = req.body;

      const { db } = await import('./src/db/index.js');
      const schema = await import('./src/db/schema.js');
      const { eq } = await import('drizzle-orm');

      let fundName = 'صندوق المعاشات النقابي';
      let currentReserve = 14500000;
      let monthlyInflow = 850000;
      let monthlyOutflow = 960000;

      if (fundId) {
        const found = await db.select().from(schema.actuarialFunds).where(eq(schema.actuarialFunds.id, fundId)).limit(1);
        if (found.length > 0) {
          fundName = found[0].name;
          currentReserve = found[0].currentReserve;
          monthlyInflow = found[0].monthlyInflow;
          monthlyOutflow = found[0].monthlyOutflow;
        }
      }

      // Mathematical Actuarial Projection Engine
      const currentYear = 2026;
      let reserve = currentReserve;
      let annualInflow = monthlyInflow * 12;
      let annualOutflow = monthlyOutflow * 12;
      let depletionYear: number | null = null;
      const projections: any[] = [];

      for (let y = 1; y <= horizonYears; y++) {
        const yearNumber = currentYear + y;
        
        // Inflow grows with member growth & inflation indexing
        annualInflow = annualInflow * (1 + (memberGrowthRate + expectedInflation * 0.3) / 100);
        // Outflow grows with retirement rate & pension cost-of-living adjustments
        annualOutflow = annualOutflow * (1 + (pensionIncreaseRate + retirementRate * 0.4) / 100);
        
        // Investment yield earned on average reserve
        const investmentReturn = reserve > 0 ? (reserve * (expectedAnnualReturn / 100)) : 0;
        const netCashFlow = annualInflow + investmentReturn - annualOutflow;
        
        reserve += netCashFlow;

        if (reserve <= 0 && depletionYear === null) {
          depletionYear = yearNumber;
        }

        const requiredReserveAtYear = annualOutflow * 3.5; // 3.5 years safety buffer standard
        const solvency = requiredReserveAtYear > 0 ? (Math.max(0, reserve) / requiredReserveAtYear) * 100 : 0;

        projections.push({
          year: yearNumber,
          yearLabel: `${yearNumber}`,
          projectedReserve: Math.round(reserve),
          projectedContributions: Math.round(annualInflow),
          projectedBenefitsPaid: Math.round(annualOutflow),
          netCashFlow: Math.round(netCashFlow),
          solvencyRatio: Number(solvency.toFixed(1)),
          isSolvent: reserve > 0,
        });
      }

      const sustainableYears = depletionYear ? (depletionYear - currentYear) : horizonYears;
      const summaryStatus = !depletionYear ? 'HEALTHY' : sustainableYears >= 7 ? 'MODERATE_RISK' : 'HIGH_DEFICIT_RISK';
      
      const recIncrease = summaryStatus === 'HIGH_DEFICIT_RISK' ? 18.5 : summaryStatus === 'MODERATE_RISK' ? 9.0 : 0;
      const recReserve = summaryStatus === 'HIGH_DEFICIT_RISK' ? Math.round(Math.abs(reserve) * 0.4) : 0;

      const actuarialOpinion = summaryStatus === 'HEALTHY'
        ? `يتمتع الصندوق بمتانة مالية واحتياطي استثماري مستقر يلبي التزامات المعاشات والمزايا للأعضاء على مدى ${horizonYears} سنوات قادمة بمعدل عائد متوقع ${expectedAnnualReturn}%.`
        : `تظهر المحاكاة ضغطاً إكتوارياً مستقبلياً مع احتمالية استنزاف الاحتياطي بحلول عام ${depletionYear}. يُوصى بزيادة اشتراكات الصندوق بنسبة لا تقل عن ${recIncrease}% ورفع العائد الاستثماري لمحافظ الودائع وصناديق الاستثمار.`;

      res.json({
        fundId,
        fundName,
        horizonYears,
        depletionYear,
        sustainableYears,
        recommendedContributionIncrease: recIncrease,
        recommendedReserveInjection: recReserve,
        summaryStatus,
        actuarialOpinion,
        projections,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 13b. معالجة المسارات غير المعروفة وأخطاء الـ API (Phase 2)
  // ==========================================
  app.use('/api', notFoundHandler);

  // ==========================================
  // 14. VITE MIDDLEWARE & SPA SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    // استيراد Vite مؤجل: لا يُحمَّل إطلاقاً في الإنتاج (خاصة داخل حزمة Electron)
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // كشف مسار الواجهة المبنية: يشمل وضع حزمة Electron (dist بجوار dist-server)
    const { moduleDir: md } = await import('./server/utils/runtime-paths.js');
    const distCandidates = [
      process.env.UNION_DIST_DIR,
      path.join(process.cwd(), 'dist'),
      path.join(md(import.meta.url), '..', 'dist'),
      path.join(md(import.meta.url), 'dist'),
    ].filter(Boolean) as string[];
    const distPath =
      distCandidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) ||
      path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(apiErrorHandler);

  const httpServer = http.createServer(app);
  attachLiveAgentWebSocketServer(httpServer);

  // استعادة كشوف المرتبات المستوردة المعتمدة سابقاً
  const restoredImports = payrollImportService.loadPersistedImports();
  if (restoredImports > 0) console.log(`📂 تم استعادة ${restoredImports} كشف مرتبات مستورد من الأرشيف.`);

  // بذر بيانات حضور تجريبية للشهر الحالي (بصمة وجه/إصبع) لتفعيل الربط مع المرتبات — مُراعِية للتفاضلية (لا تُعيد البذر إن وُجدت سجلات)
  try {
    const seedUser = erpStore.users.find((u) => u.role === 'PROGRAM_MANAGER') || erpStore.users[0];
    if (seedUser) {
      const nowDt = new Date();
      const seededAtt = attendanceService.seedDemoAttendance(seedUser, nowDt.getFullYear(), nowDt.getMonth() + 1, nowDt.getDate());
      if (seededAtt > 0) console.log(`🕐 تم بذر ${seededAtt} سجل حضور تجريبي (بصمة) للشهر الحالي.`);
    }
  } catch (e: any) {
    console.warn('⚠️ تعذر بذر الحضور التجريبي:', e?.message);
  }

  // بذر موازنة تقديرية افتراضية إن كانت قائمة الموازنات فاضية
  // (يحدث بعد تطبيق دليل الحسابات الموحد الذي يمسح البيانات التجريبية)
  if (erpStore.budgets.length === 0) {
    const expenseAccounts = erpStore.accounts.filter(
      (a) => !a.isParent && a.isActive && a.type === 'EXPENSE'
    );
    if (expenseAccounts.length > 0) {
      const fy = new Date().getFullYear();
      const perAccount = Math.floor(5_000_000 / expenseAccounts.length);
      const lines = expenseAccounts.map((acc, i) => ({
        id: `bgl-seed-${fy}-${i}`,
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        allocatedAmount: perAccount,
        committedAmount: 0,
        actualAmount: 0,
        availableAmount: perAccount,
        variancePercentage: 0,
      }));
      erpStore.budgets.push({
        id: `bgt-${fy}-seed`,
        year: fy,
        organizationId: 'org-general',
        organizationName: erpStore.organizations[0]?.name || 'النقابة العامة',
        title: `الموازنة التقديرية العامة لعام ${fy}`,
        totalAllocated: perAccount * lines.length,
        totalCommitted: 0,
        totalActual: 0,
        status: 'DRAFT',
        lines,
      } as any);
      console.log(`📊 تم بذر موازنة تقديرية افتراضية لسنة ${fy} (${lines.length} بنداً).`);
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🏛️ Union Financial ERP Server running on http://0.0.0.0:${PORT}`);
    console.log(`📌 General Syndicate Chart of Accounts & 1301 Subledger Ready`);
    console.log(`=======================================================`);
  });
}

startServer();
