import { User } from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { accountingService } from './accounting.service.js';
import { receiptsService } from './receipts.service.js';
import { reportsService } from './reports.service.js';
import { accountQueryService } from './account-query.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { cacheService } from './cache.service.js';
import { can, userPermissions } from '../security/permissions.js';
import { findDebtorsAccount } from '../utils/account-lookup.js';
import { normalizeArabicText } from '../utils/arabic.js';

/**
 * ===== AI Command Executor — تنفيذ أوامر الذكاء الاصطناعي عبر الشاشات =====
 * يوفّر سجلاً موحّداً من "الإجراءات القابلة للتنفيذ" (Actions) يمكن للمساعد الذكي
 * إطلاقه باللغة الطبيعية من أي شاشة. كل إجراء:
 *  - يتحقق من صلاحية المستخدم الفعلي (RBAC) قبل التنفيذ.
 *  - يوهم عمليات القراءة/التقارير فوراً (آمنة).
 *  - يحوّل عمليات الكتابة إلى "مسودة تأكيد" تُعرض للمستخدم ليؤكدها صراحةً
 *    قبل الترسيخ (نفس نمط execute-entry) مع سجل تدقيق صارم باسم المساعد.
 */

export interface AIConfirmation {
  actionId: string;
  label: string;
  icon: string;
  summary: string;
  details: { label: string; value: string }[];
  payload?: any;
  needs: string;
}

export interface AIActionResult {
  status: 'needs_confirmation' | 'executed';
  actionId: string;
  label: string;
  message: string;
  confirmation?: AIConfirmation;
  result?: any;
}

export interface AIActionDef {
  id: string;
  label: string;
  icon: string;
  permission: string;
  requiresConfirmation: boolean;
  /**
   * بناء ملخص المسودة + الحمولة المطلوبة للتأكيد.
   * يُستدعى فقط للعمليات التي تتطلب تأكيداً أو للتحقق من المعطيات.
   */
  buildConfirmation(user: User, orgId: string, args: any): AIConfirmation;
  /** تنفيذ فعلي بعد تأكيد المستخدم (أو فوراً لعمليات القراءة). */
  execute(user: User, orgId: string, args: any): any;
}

type Registry = Record<string, AIActionDef>;

function num(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function accountsList(orgId: string, limit = 200) {
  return erpStore.accounts
    .filter((a) => a.isActive)
    .slice(0, limit)
    .map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, nature: a.nature, requiresSubledger: !!a.requiresSubledger }));
}

class AIActionsService {
  private registry: Registry = {};

  constructor() {
    this.registerDefaultActions();
  }

  register(action: AIActionDef): void {
    this.registry[action.id] = action;
  }

  listActions(): { id: string; label: string; icon: string; permission: string; requiresConfirmation: boolean }[] {
    return Object.values(this.registry).map(({ id, label, icon, permission, requiresConfirmation }) => ({
      id,
      label,
      icon,
      permission,
      requiresConfirmation,
    }));
  }

  handle(user: User | null, orgId: string | undefined, actionId: string, args: any): AIActionResult {
    const action = this.registry[actionId];
    if (!action) {
      return { status: 'executed', actionId, label: 'غير معروف', message: `الإجراء [${actionId}] غير معروف.` };
    }
    if (!user) {
      return {
        status: 'executed',
        actionId,
        label: action.label,
        message: 'لا يوجد مستخدم موثّق لتنفيذ الأمر. سجّل الدخول أولاً.',
      };
    }
    if (!can(user, action.permission)) {
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ACTION_DENIED',
        'AI_ACTION',
        actionId,
        `رفض أمر الذكاء الاصطناعي [${action.label}] — المستخدم [${user.fullName}] لا يملك صلاحية [${action.permission}]`,
        undefined,
        undefined,
        'BLOCKED'
      );
      return {
        status: 'executed',
        actionId,
        label: action.label,
        message: `لا تملك الصلاحية (${action.permission}) لتنفيذ «${action.label}».`,
      };
    }

    if (action.requiresConfirmation) {
      const confirmation = action.buildConfirmation(user, orgId || user.organizationId, args || {});
      return {
        status: 'needs_confirmation',
        actionId,
        label: action.label,
        message: `أعدّت أمر «${action.label}» بانتظار تأكيدك.`,
        confirmation,
      };
    }

    try {
      const result = action.execute(user, orgId || user.organizationId, args || {});
      return { status: 'executed', actionId, label: action.label, message: `تم تنفيذ «${action.label}» بنجاح.`, result };
    } catch (err: any) {
      return { status: 'executed', actionId, label: action.label, message: `تعذر تنفيذ «${action.label}»: ${err.message || err}` };
    }
  }

  /** تنفيذ إجراء مؤكد بعد موافقة المستخدم (المسار الحبي). */
  confirm(user: User | null, orgId: string | undefined, actionId: string, payload: any): AIActionResult {
    const action = this.registry[actionId];
    if (!action) return { status: 'executed', actionId, label: 'غير معروف', message: `الإجراء [${actionId}] غير معروف.` };
    if (!user) return { status: 'executed', actionId, label: action.label, message: 'لا يوجد مستخدم موثّق.' };
    if (!can(user, action.permission)) {
      return {
        status: 'executed',
        actionId,
        label: action.label,
        message: `لا تملك الصلاحية (${action.permission}) لتنفيذ «${action.label}».`,
      };
    }
    try {
      const result = action.execute(user, orgId || user.organizationId, payload || {});
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ACTION_EXECUTED',
        'AI_ACTION',
        actionId,
        `أمر الذكاء الاصطناعي المؤكد [${action.label}] نُفّذ للمستخدم ${user.fullName} بمجموع ${userPermissions(user).length} صلاحية.`
      );
      cacheService.invalidatePrefix('cache:');
      return { status: 'executed', actionId, label: action.label, message: `تم تنفيذ «${action.label}» بنجاح.`, result };
    } catch (err: any) {
      return { status: 'executed', actionId, label: action.label, message: `تعذر تنفيذ «${action.label}»: ${err.message || err}` };
    }
  }

  private registerDefaultActions(): void {
    // ===== عمليات القراءة / التقارير: تنفَّذ فوراً (آمنة) =====
    this.register({
      id: 'run_trial_balance',
      label: 'ميزان المراجعة',
      icon: 'balance',
      permission: 'view:all',
      requiresConfirmation: false,
      buildConfirmation: (_u, _o, _a) => {
        throw new Error('إجراء قراءة لا يتطلب تأكيداً.');
      },
      execute: (_u, orgId, args) => {
        const tb = reportsService.getTrialBalance({ organizationId: orgId });
        return { kind: 'report', title: 'ميزان المراجعة', items: tb.items || [], totals: tb.totals };
      },
    });

    this.register({
      id: 'run_income_expense',
      label: 'كشف الإيرادات والمصروفات',
      icon: 'chart',
      permission: 'view:all',
      requiresConfirmation: false,
      buildConfirmation: (_u, _o, _a) => {
        throw new Error('إجراء قراءة لا يتطلب تأكيداً.');
      },
      execute: (_u, orgId, args) => {
        return { kind: 'report', title: 'كشف الإيرادات والمصروفات', report: reportsService.getIncomeExpenseReport({ organizationId: orgId }) };
      },
    });

    this.register({
      id: 'list_debtors',
      label: 'كشف المدينين (1301)',
      icon: 'users',
      permission: 'view:all',
      requiresConfirmation: false,
      buildConfirmation: (_u, _o, _a) => {
        throw new Error('إجراء قراءة لا يتطلب تأكيداً.');
      },
      execute: (_u, orgId, args) => {
        const keyword = String(args?.keyword || '').trim();
        let parties = erpStore.subledgerParties.filter((p) => p.associatedAccountId === (findDebtorsAccount()?.id || 'acc-1301'));
        if (keyword) {
          const n = normalizeArabicText(keyword);
          parties = parties.filter((p) => p.normalizedName.includes(n) || p.partyCode.toLowerCase().includes(n.toLowerCase()));
        }
        return {
          kind: 'list',
          title: 'كشف المدينين',
          count: parties.length,
          items: parties.slice(0, 100).map((p) => ({ partyCode: p.partyCode, name: p.name, balance: p.currentBalance ?? 0 })),
          totalBalance: parties.reduce((s, p) => s + (p.currentBalance || 0), 0),
        };
      },
    });

    this.register({
      id: 'list_pending_entries',
      label: 'القيود المعلقة/بانتظار الاعتماد',
      icon: 'inbox',
      permission: 'view:all',
      requiresConfirmation: false,
      buildConfirmation: (_u, _o, _a) => {
        throw new Error('إجراء قراءة لا يتطلب تأكيداً.');
      },
      execute: (_u, orgId, args) => {
        const data = accountQueryService.getPendingEntries(orgId);
        return { kind: 'list', title: 'القيود المعلقة', data };
      },
    });

    this.register({
      id: 'list_accounts',
      label: 'عرض دليل الحسابات',
      icon: 'book',
      permission: 'view:all',
      requiresConfirmation: false,
      buildConfirmation: (_u, _o, _a) => {
        throw new Error('إجراء قراءة لا يتطلب تأكيداً.');
      },
      execute: (_u, orgId, args) => {
        const keyword = String(args?.keyword || '').trim();
        let list = accountsList(orgId);
        if (keyword) {
          const n = normalizeArabicText(keyword);
          list = list.filter((a) => a.name.includes(keyword) || a.name.includes(n) || a.code.includes(keyword));
        }
        return { kind: 'list', title: 'دليل الحسابات', count: list.length, items: list };
      },
    });

    // ===== عمليات الكتابة: مسودة تأكيد أولاً =====

    this.register({
      id: 'create_account',
      label: 'إضافة حساب جديد',
      icon: 'plus',
      permission: 'accounts:manage',
      requiresConfirmation: true,
      buildConfirmation: (user, orgId, args) => {
        const code = String(args.code || '').trim();
        const name = String(args.name || '').trim();
        const type = String(args.type || '').trim();
        const nature = String(args.nature || '').trim();
        if (!code || !name || !type || !nature) {
          throw new Error('بيانات الحساب ناقصة: الاسم والكود والنوع والطبيعة مطلوبة.');
        }
        if (erpStore.accounts.some((a) => a.code === code)) {
          throw new Error(`كود الحساب [${code}] موجود بالفعل.`);
        }
        return {
          actionId: 'create_account',
          label: 'إضافة حساب جديد',
          icon: 'plus',
          summary: `إضافة حساب "${name}" (كود ${code}) من نوع ${type}`,
          details: [
            { label: 'الكود', value: code },
            { label: 'الاسم', value: name },
            { label: 'النوع', value: type },
            { label: 'الطبيعة', value: nature },
            { label: 'أستاذ مساعد', value: args.requiresSubledger ? 'نعم' : 'لا' },
          ],
          payload: { code, name, type, nature, requiresSubledger: !!args.requiresSubledger, subledgerType: args.subledgerType || 'NONE' },
          needs: 'accounts:manage',
        };
      },
      execute: (user, _orgId, args) => {
        const code = String(args.code || '').trim();
        const name = String(args.name || '').trim();
        const type = String(args.type || '').trim();
        const nature = String(args.nature || '').trim();
        if (erpStore.accounts.some((a) => a.code === code)) throw new Error(`كود الحساب [${code}] موجود بالفعل.`);
        const newAcc: any = {
          id: `acc-${Date.now()}`,
          code,
          name,
          type,
          nature,
          parentId: args.parentId || undefined,
          isParent: false,
          level: 1,
          requiresSubledger: !!args.requiresSubledger,
          subledgerType: args.subledgerType || 'NONE',
          currentBalance: 0,
          isActive: true,
        };
        erpStore.accounts.push(newAcc);
        postgresManager.persistAccount(newAcc);
        erpStore.recordAudit(user.id, user.fullName, user.role, user.organizationId, 'ACCOUNT_CREATED', 'ACCOUNT', newAcc.id, `أمر AI: إضافة حساب [${code} - ${name}]`);
        return { account: newAcc };
      },
    });

    this.register({
      id: 'create_subledger_party',
      label: 'إضافة جهة/أستاذ مساعد',
      icon: 'userplus',
      permission: 'subledger:manage',
      requiresConfirmation: true,
      buildConfirmation: (user, orgId, args) => {
        const name = String(args.name || '').trim();
        if (!name) throw new Error('اسم الجهة مطلوب.');
        let accountId = args.associatedAccountId || (findDebtorsAccount()?.id as string) || 'acc-1301';
        const acc = erpStore.accounts.find((a) => a.id === accountId || a.code === String(accountId || ''));
        if (acc) accountId = acc.id;
        return {
          actionId: 'create_subledger_party',
          label: 'إضافة جهة/أستاذ مساعد',
          icon: 'userplus',
          summary: `إضافة الجهة "${name}" على الحساب ${acc ? `${acc.code} - ${acc.name}` : accountId}`,
          details: [
            { label: 'الاسم', value: name },
            { label: 'الحساب', value: acc ? `${acc.code} - ${acc.name}` : accountId },
            { label: 'هاتف', value: args.phone || '—' },
          ],
          payload: { name, associatedAccountId: accountId, phone: args.phone, taxNumber: args.taxNumber, type: args.type },
          needs: 'subledger:manage',
        };
      },
      execute: (user, orgId, args) => {
        const result = accountingService.findOrCreateSubledgerParty(
          String(args.name || '').trim(),
          args.associatedAccountId || (findDebtorsAccount()?.id as string) || 'acc-1301',
          orgId,
          user
        );
        if (args.phone) result.party.phone = args.phone;
        if (args.taxNumber) result.party.taxNumber = args.taxNumber;
        if (args.type) result.party.type = args.type;
        cacheService.invalidatePrefix('subledger:');
        return { party: result.party, isNew: result.isNew, warning: result.similarPartyWarning };
      },
    });

    this.register({
      id: 'create_receipt',
      label: 'إصدار سند قبض/تحصيل',
      icon: 'wallet',
      permission: 'receipts:issue',
      requiresConfirmation: true,
      buildConfirmation: (user, orgId, args) => {
        const amount = num(args.amount);
        const fromName = String(args.fromName || args.partyName || args.party || '').trim();
        if (amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
        if (!fromName) throw new Error('اسم المحصَّل منه مطلوب.');
        return {
          actionId: 'create_receipt',
          label: 'إصدار سند قبض',
          icon: 'wallet',
          summary: `إصدار سند قبض بقيمة ${amount.toLocaleString()} ج.م من "${fromName}"`,
          details: [
            { label: 'المبلغ', value: `${amount.toLocaleString()} ج.م` },
            { label: 'المحصَّل منه', value: fromName },
            { label: 'البيان', value: args.description || '—' },
            { label: 'طريقة الدفع', value: String(args.paymentMethod || 'CASH') },
            { label: 'ترحيل آلي', value: args.autoPostJournal ? 'نعم' : 'لا' },
          ],
          payload: {
            amount,
            payerName: fromName,
            description: args.description,
            paymentMethod: String(args.paymentMethod || 'CASH'),
            autoPostJournal: !!args.autoPostJournal,
            date: args.date || new Date().toISOString().split('T')[0],
          },
          needs: 'receipts:issue',
        };
      },
      execute: (user, orgId, args) => {
        const revenueType = erpStore.distributionRules[0];
        const dto: any = {
          organizationId: orgId,
          date: args.date || new Date().toISOString().split('T')[0],
          payerName: String(args.payerName || '').trim(),
          revenueTypeId: args.revenueTypeId || revenueType?.id || 'GENERAL',
          amount: num(args.amount),
          paymentMethod: String(args.paymentMethod || 'CASH'),
          notes: String(args.description || 'سند قبض عبر المساعد الذكي'),
          autoPostJournal: !!args.autoPostJournal,
          userId: user.id,
        };
        const result = receiptsService.issueReceipt(dto, user);
        postgresManager.persistReceipt(result.receipt);
        cacheService.invalidatePrefix('cache:');
        return { receipt: result.receipt, journalEntryId: result.journalEntryId };
      },
    });
  }
}

export const aiActionsService = new AIActionsService();
