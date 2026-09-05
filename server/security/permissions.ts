import type { User } from '../../src/types/erp.js';

/**
 * ===== نظام الصلاحيات المعتمد (RBAC) =====
 * المستخدمون الفعليون وأدوارهم وصلاحياتهم المحددة من إدارة النقابة:
 *
 * 1. محمد عبد الله أحمد   — مدير البرنامج   → جميع الصلاحيات (*) وبينها وحدةً الحضور والانصراف
 *    كاملة: تسجيل/استيراد البصمة + تعديل السجلات + حذفها + اعتماد مسير المرتبات وترحيله
 * 2. محمد محمد عبد الرسول — محاسب          → التسجيل بشاشة اليومية فقط + اطلاع/بحث/طباعة
 * 3. هشام مصطفى محمد      — رئيس الحسابات   → اطلاع/بحث/طباعة فقط
 * 4. عبد المنعم الجمل     — رئيس النقابة العامة → اطلاع/بحث/طباعة فقط
 *
 * صلاحية الحضور (attendance:manage): بصمة حضور/انصراف، استيراد سجلات الأجهزة،
 * تعديل الحركات وحذفها، إعدادات الوردية، وتوليد المسير المرتبط بالحضور.
 */

export type Permission =
  | 'view:all'
  | 'search:all'
  | 'print:all'
  | 'journal:create'
  | 'journal:workflow'
  | 'accounts:manage'
  | 'subledger:manage'
  | 'members:manage'
  | 'hr:manage'
  | 'attendance:manage'
  | 'receipts:issue'
  | 'documents:manage'
  | 'periods:manage'
  | 'import:execute'
  | 'system:admin';

export interface RoleDefinition {
  role: string;
  labelAr: string;
  permissions: Permission[] | ['*'];
  descriptionAr: string;
}

export const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  PROGRAM_MANAGER: {
    role: 'PROGRAM_MANAGER',
    labelAr: 'مدير البرنامج',
    permissions: ['*'],
    descriptionAr: 'جميع الصلاحيات: التسجيل والاعتماد والترحيل والإعدادات',
  },
  JOURNAL_ACCOUNTANT: {
    role: 'JOURNAL_ACCOUNTANT',
    labelAr: 'محاسب يومية',
    permissions: ['view:all', 'search:all', 'print:all', 'journal:create'],
    descriptionAr: 'التسجيل بشاشة اليومية فقط، مع الاطلاع على جميع الشاشات والبحث وطباعة التقارير',
  },
  HEAD_OF_ACCOUNTS: {
    role: 'HEAD_OF_ACCOUNTS',
    labelAr: 'رئيس الحسابات',
    permissions: ['view:all', 'search:all', 'print:all'],
    descriptionAr: 'الاطلاع على جميع الشاشات والبحث وطباعة أي تقارير',
  },
  PRESIDENT: {
    role: 'PRESIDENT',
    labelAr: 'رئيس النقابة العامة',
    permissions: ['view:all', 'search:all', 'print:all'],
    descriptionAr: 'الاطلاع على جميع الشاشات والبحث وطباعة جميع التقارير',
  },

  // ===== أدوار تجريبية داخلية (تبقى لاختبارات فصل المهام SoD) =====
  SYSTEM_ADMIN: {
    role: 'SYSTEM_ADMIN',
    labelAr: 'مدير النظام',
    permissions: ['*'],
    descriptionAr: 'دور تجريبي داخلي — جميع الصلاحيات',
  },
  CHIEF_FINANCIAL_OFFICER: {
    role: 'CHIEF_FINANCIAL_OFFICER',
    labelAr: 'المدير المالي',
    permissions: ['*'],
    descriptionAr: 'دور تجريبي داخلي — جميع الصلاحيات المالية',
  },
  GENERAL_ACCOUNTANT: {
    role: 'GENERAL_ACCOUNTANT',
    labelAr: 'محاسب عام',
    permissions: ['view:all', 'search:all', 'print:all', 'journal:create'],
    descriptionAr: 'دور تجريبي داخلي',
  },
  COLLECTION_OFFICER: {
    role: 'COLLECTION_OFFICER',
    labelAr: 'مسؤول التحصيل',
    permissions: ['view:all', 'search:all', 'print:all', 'receipts:issue'],
    descriptionAr: 'دور تجريبي داخلي',
  },
  INTERNAL_AUDITOR: {
    role: 'INTERNAL_AUDITOR',
    labelAr: 'مدقق داخلي',
    permissions: ['view:all', 'search:all', 'print:all'],
    descriptionAr: 'دور تجريبي داخلي — اطلاع وتدقيق',
  },
};

/** صلاحيات مستخدم (توسيع النجمة) */
export function userPermissions(user?: User | null): string[] {
  if (!user) return [];
  const def = ROLE_DEFINITIONS[user.role];
  if (!def) return ['view:all', 'search:all', 'print:all']; // الحد الأدنى الافتراضي
  return def.permissions as string[];
}

/** هل يملك المستخدم صلاحية معينة؟ */
export function can(user: User | null | undefined, permission: Permission | string): boolean {
  const perms = userPermissions(user);
  return perms.includes('*') || perms.includes(permission);
}

/** معرفات المستخدمين المعفون من قواعد فصل المهام (SoD) — يُكملون دورة القيد كاملة (إنشاء/اعتماد/ترحيل) بأنفسهم */
export const SOD_EXEMPT_USER_IDS = new Set<string>(['usr-mohamed-abdallah']);

/** هل المستخدم معفى من قواعد فصل المهام (SoD)؟ (مدير النظام + المستخدمون المعتمدون في القائمة) */
export function isSodExempt(user?: User | null): boolean {
  if (!user) return false;
  return user.role === 'SYSTEM_ADMIN' || SOD_EXEMPT_USER_IDS.has(user.id);
}

/** هل المستخدم للقراءة فقط (اطلاع/بحث/طباعة دون أي تسجيل)؟ */
export function isReadOnlyUser(user?: User | null): boolean {
  return (
    !can(user, 'journal:create') &&
    !can(user, 'receipts:issue') &&
    !can(user, 'accounts:manage') &&
    !can(user, 'members:manage')
  );
}
