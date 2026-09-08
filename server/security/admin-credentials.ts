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


/** Optional provisioning for existing non-admin ERP users; never changes roles or creates accounts. */
export function configureUserCredentials(users: User[], env: Record<string, string | undefined> = process.env): void {
  const raw = env.ERP_USER_PASSWORD_HASHES?.trim();
  if (!raw) return;
  let values: unknown;
  try { if (raw.length > 16000) throw new Error(); values = JSON.parse(raw); }
  catch { throw new Error('ERP_USER_PASSWORD_HASHES must be a valid server-side JSON map.'); }
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 50) throw new Error('Invalid ERP_USER_PASSWORD_HASHES map.');
  const updates = Object.entries(values).map(([id, hash]) => {
    const user = users.find(item => item.id === id);
    if (!user || user.isDemo || !user.isActive || typeof hash !== 'string' || !/^\$2[aby]\$(1[0-6])\$[./A-Za-z0-9]{53}$/.test(hash)) {
      throw new Error('Password provisioning requires existing active non-demo users and valid bcrypt hashes (cost 10–16).');
    }
    return { user, hash };
  });
  for (const { user, hash } of updates) user.passwordHash = hash;
}
