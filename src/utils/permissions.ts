import type { User } from '../types/erp.js';

/** هل يملك المستخدم صلاحية معينة؟ (يدعم النجمة = كل الصلاحيات) */
export function hasPerm(user: User | null | undefined, permission: string): boolean {
  const perms = user?.permissions || [];
  return perms.includes('*') || perms.includes(permission);
}

/** مستخدم اطلاع فقط (بدون أي صلاحية تسجيل)؟ */
export function isReadOnly(user: User | null | undefined): boolean {
  return (
    !hasPerm(user, 'journal:create') &&
    !hasPerm(user, 'receipts:issue') &&
    !hasPerm(user, 'accounts:manage') &&
    !hasPerm(user, 'members:manage')
  );
}
