import { erpStore } from '../db/store.js';
import { normalizeArabicText } from './arabic.js';
import type { Account } from '../../src/types/erp.js';

/**
 * مُحلّل حساب المدينين المتنوعين الرئيسي في النظام.
 * يدعم الدليل التجريبي (كود 1301) والدليل الموحد المستورد (مدينون متنوعون بأي كود)
 * حتى تعمل كل الشاشات والمحركات بغض النظر عن الدليل النشط.
 */
export function findDebtorsAccount(): Account | undefined {
  return (
    erpStore.accounts.find((a) => a.code === '1301') ||
    erpStore.accounts.find(
      (a) => !a.isParent && normalizeArabicText(a.name) === normalizeArabicText('مدينون متنوعون')
    ) ||
    erpStore.accounts.find((a) => a.requiresSubledger && a.subledgerType === 'MISC_DEBTOR')
  );
}

/** معرف حساب المدينين (أو null إن لم يوجد) */
export function debtorsAccountId(): string | null {
  return findDebtorsAccount()?.id ?? null;
}

// ============ محللات دلالية مستقلة عن الدليل النشط ============

const norm = (s: string) => normalizeArabicText(s);

/** البحث بكود أو اسم (مطابق تماماً بعد التطبيع) */
export function findAccountByCodeOrName(hint?: string): Account | undefined {
  if (!hint) return undefined;
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
  return active.find((a) => a.code === hint) || active.find((a) => norm(a.name) === norm(hint));
}

/**
 * حساب الخزينة/البنك — ترتيب أولوية دلالي دقيق:
 * 1) بنك بالاسم المذكور (صوتياً أو صراحة)
 * 2) حساب يبدأ اسمه بـ"الخزينة/نقدية" (إشارة قوية تمنع مطابقة "تأمين على الخزينة")
 * 3) بنك مصر تحديداً ثم أي بنك ثم أي نقدية ثم أول أصل
 */
export function findTreasuryAccount(preferBankName?: string): Account | undefined {
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
  if (preferBankName) {
    const b = active.find((a) => norm(a.name).includes(norm(preferBankName)));
    if (b) return b;
  }
  return (
    active.find((a) => /^(الخزينه|نقديه|الخزينة|نقدية)/.test(norm(a.name))) ||
    active.find((a) => norm(a.name) === norm('بنك مصر')) ||
    active.find((a) => norm(a.name).includes('بنك')) ||
    active.find((a) => norm(a.name).includes('نقد')) ||
    active.find((a) => a.type === 'ASSET')
  );
}

/** حساب مصروف: بالكلمة المفتاحية ثم "عموم" ثم أول مصروف */
export function findExpenseAccount(keyword?: string): Account | undefined {
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive && a.type === 'EXPENSE');
  if (keyword) {
    const k = active.find((a) => norm(a.name).includes(norm(keyword)));
    if (k) return k;
  }
  return active.find((a) => norm(a.name).includes('عموم')) || active[0];
}

/** حساب إيراد: بالكلمة المفتاحية ثم "اشتراك" ثم أول إيراد */
export function findRevenueAccount(keyword?: string): Account | undefined {
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive && a.type === 'REVENUE');
  if (keyword) {
    const k = active.find((a) => norm(a.name).includes(norm(keyword)));
    if (k) return k;
  }
  return active.find((a) => norm(a.name).includes('اشتراك')) || active.find((a) => norm(a.name).includes('لجان')) || active[0];
}

/** حساب التزامات/دائنين (لمستحقات الموردين من الفواتير) */
export function findLiabilityAccount(): Account | undefined {
  const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive && a.type === 'LIABILITY');
  return (
    active.find((a) => norm(a.name).includes('دائن')) ||
    active.find((a) => norm(a.name).includes('مورد')) ||
    active.find((a) => norm(a.name).includes('مستحق')) ||
    active.find((a) => norm(a.name).includes('تأمين')) ||
    active[0]
  );
}
