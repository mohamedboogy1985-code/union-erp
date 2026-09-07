import type { User } from '../../src/types/erp.js';
import { can } from './permissions.js';

export const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(1[0-6])\$[./A-Za-z0-9]{53}$/;

/** Optional bootstrap for an existing, real administrator. No default password. */
export function configureAdminCredentials(
  users: User[],
  env: Record<string, string | undefined> = process.env
): void {
  const hash = env.ERP_ADMIN_PASSWORD_HASH?.trim();
  if (!hash) return;
  if (!BCRYPT_HASH_PATTERN.test(hash)) {
    throw new Error(
      'ERP_ADMIN_PASSWORD_HASH يجب أن يكون bcrypt صالحاً بتكلفة من 10 إلى 16. استخدم npm run auth:hash-password.'
    );
  }
  const user = users.find(
    (candidate) => candidate.id === (env.ERP_ADMIN_USER_ID || 'usr-mohamed-abdallah')
  );
  if (!user || !user.isActive || user.isDemo || !can(user, 'system:admin')) {
    throw new Error('ERP_ADMIN_USER_ID يجب أن يشير إلى مدير فعلي نشط، وليس حساب عرض تجريبي.');
  }
  user.passwordHash = hash;
}

/** User API responses must never expose password hashes. */
export function publicUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
